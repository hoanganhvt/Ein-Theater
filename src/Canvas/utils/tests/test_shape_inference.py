import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from bootstrap import UTILS, GENERATOR

import torch
from torch import nn

from auto_shape_fitting.shape_inference import ShapeEngine, infer_shapes, register_module, validate_for_save
from model_storage import save_model_to_folder


def node(nid, kind, **params):
    return dict(id=nid, layerType=kind, params=params)


def source(nid='x', shape='4', batch=2, dtype='float32'):
    return node(nid, 'Input', input_type='raw data', shape_preset=shape, batch_size=batch, dtype=dtype)


def chain(*nodes, name='model'):
    return dict(name=name, nodes=list(nodes), edges=[dict(id=f'e{i}', **{'from': a['id'], 'to': b['id']})
                                                   for i, (a, b) in enumerate(zip(nodes, nodes[1:]))])


def by_id(graph):
    return {n['id']: n for n in graph['nodes']}


class ShapeTests(unittest.TestCase):
    def assert_valid(self, graph):
        for n in graph['nodes']:
            self.assertFalse(n['tensorInfo']['message'], (n['id'], n['tensorInfo']['message']))

    def test_cnn_resize_and_fx_metadata(self):
        graph = chain(source(shape='1,28,28'), node('conv', 'nn.Conv2d', out_channels=8, kernel_size=3, padding=1),
                      node('relu', 'nn.ReLU'), node('pool', 'nn.MaxPool2d', kernel_size=2, stride=2),
                      node('flat', 'nn.Flatten'), node('dense', 'nn.Linear', out_features=10))
        before = copy.deepcopy(graph)
        result, values, fx_module = ShapeEngine().infer(graph)
        self.assertEqual(graph, before)
        self.assert_valid(result)
        nodes = by_id(result)
        self.assertEqual(nodes['conv']['params']['in_channels'], 1)
        self.assertEqual(nodes['dense']['params']['in_features'], 1568)
        self.assertEqual(nodes['dense']['tensorInfo']['output'], [2, 10])
        fx_dense = next(n for n in fx_module.graph.nodes if n.meta.get('canvas_id') == 'dense')
        self.assertEqual(list(fx_dense.meta['tensor_meta'].shape), [2, 10])
        self.assertEqual(values['dense'].device.type, 'meta')
        self.assertTrue(all(p.device.type == 'meta' for p in fx_module.parameters()))
        graph['nodes'][0]['params']['shape_preset'] = '3,32,32'
        resized = by_id(infer_shapes(graph))
        self.assertEqual(resized['conv']['params']['in_channels'], 3)
        self.assertEqual(resized['dense']['params']['in_features'], 2048)
        graph['edges'] = [e for e in graph['edges'] if e['to'] != 'pool']
        disconnected = by_id(infer_shapes(graph))
        self.assertIsNone(disconnected['dense']['tensorInfo']['output'])

    def test_generic_modules_match_real_pytorch(self):
        cases = [
            ('nn.ConvTranspose2d', dict(in_channels=3, out_channels=4, kernel_size=3, stride=2, padding=1, output_padding=1), [2, 3, 7, 9]),
            ('nn.AdaptiveAvgPool2d', dict(output_size=[3, 2]), [2, 3, 11, 13]),
            ('nn.Upsample', dict(size=None, scale_factor=2, mode='nearest'), [2, 3, 7, 9]),
            ('nn.GroupNorm', dict(num_groups=1, num_channels=3), [2, 3, 7, 9]),
            ('nn.MaxPool2d', dict(kernel_size=3, stride=2, padding=1, ceil_mode=True), [2, 3, 7, 9]),
        ]
        for kind, params, shape in cases:
            with self.subTest(kind=kind):
                graph = chain(source(shape=shape[1:]), node('layer', kind, **params))
                result = infer_shapes(graph)
                self.assert_valid(result)
                final = by_id(result)['layer']
                actual = getattr(nn, kind[3:])(**params).eval()(torch.zeros(shape))
                self.assertEqual(final['tensorInfo']['output'], list(actual.shape))

    def test_invalid_branch_and_cycle_do_not_guess(self):
        graph = chain(source(shape='1,8,8'), node('conv', 'nn.Conv2d', in_channels=3, out_channels=8, groups=2, kernel_size=3),
                      node('next', 'nn.ReLU'))
        result = by_id(infer_shapes(graph))
        self.assertEqual(result['conv']['params']['in_channels'], 3)
        self.assertIsNone(result['next']['tensorInfo']['output'])
        graph['nodes'] += [source('independent', '9'), node('good', 'nn.Linear', out_features=2)]
        graph['edges'] += [dict(id='e3', **{'from': 'independent', 'to': 'good'}), dict(id='e4', **{'from': 'next', 'to': 'conv'})]
        result = by_id(infer_shapes(graph))
        self.assertIn('Cycle', result['conv']['tensorInfo']['message'])
        self.assertEqual(result['good']['tensorInfo']['output'], [2, 2])
        with self.assertRaises(ValueError):
            validate_for_save(dict(nodes=list(result.values()), edges=graph['edges']))

    def test_tuple_selection_and_recurrent_adaptation(self):
        graph = chain(source(shape='5,7'), node('rnn', 'nn.LSTM', hidden_size=4, num_layers=1, batch_first=True),
                      node('select', 'operator.getitem', index=0), node('dense', 'nn.Linear', out_features=3))
        result = infer_shapes(graph)
        self.assert_valid(result)
        nodes = by_id(result)
        self.assertEqual(nodes['rnn']['params']['input_size'], 7)
        self.assertEqual(nodes['rnn']['tensorInfo']['outputTree'][0]['shape'], [2, 5, 4])
        self.assertEqual(nodes['dense']['tensorInfo']['output'], [2, 5, 3])
        with tempfile.TemporaryDirectory() as root:
            saved = save_model_to_folder(graph, root)
            model = load_generated(saved)
            self.assertEqual(list(model(torch.zeros(2, 5, 7)).shape), [2, 5, 3])

    def test_custom_extension_and_bad_inputs(self):
        class ExpandLast(nn.Module):
            def forward(self, x):
                return x.unsqueeze(-1).expand(*x.shape, 3)
        register_module('custom.ExpandLast', ExpandLast)
        result = infer_shapes(chain(source(), node('expand', 'custom.ExpandLast')))
        self.assert_valid(result)
        self.assertEqual(by_id(result)['expand']['tensorInfo']['output'], [2, 4, 3])
        for value in ['bad', '3,-2', '0', '2.5']:
            self.assertTrue(by_id(infer_shapes(chain(source(shape=value))))['x']['tensorInfo']['message'])
        bad = infer_shapes(chain(source(), node('bad', 'CustomUnknown')))
        self.assertIn('Unregistered', by_id(bad)['bad']['tensorInfo']['message'])

    def test_attention_constructor_fields_survive_generation(self):
        graph = dict(name='attention_model', nodes=[source('q','5,8'), source('k','7,6'), source('v','7,10'),
                     node('attention','nn.MultiheadAttention',num_heads=2,batch_first=True),
                     node('select','operator.getitem',index=0)],
                     edges=[dict(id=f'e{i}', **{'from':nid,'to':'attention'}) for i,nid in enumerate(['q','k','v'])]
                           + [dict(id='e3', **{'from':'attention','to':'select'})])
        result = infer_shapes(graph)
        self.assert_valid(result)
        params = by_id(result)['attention']['params']
        self.assertEqual([params[k] for k in ['embed_dim','kdim','vdim']], [8,6,10])
        with tempfile.TemporaryDirectory() as root:
            saved = save_model_to_folder(graph,root)
            model = load_generated(saved)
            output = model(torch.zeros(2,5,8),torch.zeros(2,7,6),torch.zeros(2,7,10))
            self.assertEqual(list(output.shape),[2,5,8])


def write_canvas(root, graph):
    folder = Path(root) / graph['name']
    folder.mkdir()
    (folder / (graph['name'] + '.json')).write_text(json.dumps({'canvas': graph}), encoding='utf8')
    (folder / (graph['name'] + '.py')).write_text('# original source\n', encoding='utf8')
    return folder


def load_generated(saved):
    spec = importlib.util.spec_from_file_location(saved['modelName'], saved['pyFile'])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, saved['modelName'])()


class IntegratedTests(unittest.TestCase):
    def nested(self, root):
        write_canvas(root, chain(source(), node('dense', 'nn.Linear', in_features=4, out_features=6), name='encoder'))
        middle = write_canvas(root, chain(source(), node('encoder', 'IntegratedModel', model_path='../encoder', model_name='encoder'),
                                           node('dense', 'nn.Linear', in_features=6, out_features=3), name='middle'))
        return chain(source(shape='8'), node('middle', 'IntegratedModel', model_path=str(middle), model_name='middle'),
                     node('dense', 'nn.Linear', out_features=2), name='parent')

    def test_recursive_variants_execute_reload_and_preserve_sources(self):
        with tempfile.TemporaryDirectory() as root:
            graph = self.nested(root)
            original = (Path(root) / 'encoder/encoder.json').read_bytes()
            result = infer_shapes(graph)
            adapted = by_id(result)['middle']['adaptedModel']
            inner = by_id(adapted)['encoder']['adaptedModel']
            self.assertEqual(by_id(inner)['dense']['params']['in_features'], 8)
            self.assertEqual(result, infer_shapes(graph))
            graph['nodes'] += [source('second_input', '12'), node('second_model', 'IntegratedModel', model_path=str(Path(root)/'middle'), model_name='middle'), node('second_output', 'nn.Linear', out_features=5)]
            graph['edges'] += [dict(id='e2', **{'from':'second_input', 'to':'second_model'}), dict(id='e3', **{'from':'second_model', 'to':'second_output'})]
            saved = save_model_to_folder(graph, root)
            self.assertEqual(len(saved['adaptedModels']), 4)
            model = load_generated(saved)
            self.assertEqual([list(t.shape) for t in model(torch.zeros(2,8), torch.zeros(2,12))], [[2,2], [2,5]])
            widths = {m.in_features for m in model.modules() if isinstance(m, nn.Linear)}
            self.assertTrue({8,12}.issubset(widths))
            reloaded = infer_shapes(json.loads(Path(saved['jsonFile']).read_text()), saved['folder'])
            self.assertFalse(any(n.get('adaptedModel') for n in reloaded['nodes']))
            self.assertEqual(original, (Path(root)/'encoder/encoder.json').read_bytes())
            self.assertEqual('# original source\n', (Path(root)/'encoder/encoder.py').read_text())
            self.assertEqual(saved['adaptedModels'], save_model_to_folder(graph, root)['adaptedModels'])

    def test_multi_input_order_and_recursive_reference(self):
        with tempfile.TemporaryDirectory() as root:
            merge = dict(name='merge', nodes=[source('a','4'), source('b','7'), node('cat','torch.cat',dim=1), node('dense','nn.Linear',in_features=11,out_features=2)],
                         edges=[dict(id='e0', **{'from':'a','to':'cat'}), dict(id='e1', **{'from':'b','to':'cat'}), dict(id='e2', **{'from':'cat','to':'dense'})])
            folder = write_canvas(root, merge)
            parent = dict(name='parent', nodes=[source('a','3'),source('b','5'),node('model','IntegratedModel',model_name='merge',model_path=str(folder))],
                          edges=[dict(id='e10', **{'from':'b','to':'model'}),dict(id='e2', **{'from':'a','to':'model'})])
            saved = save_model_to_folder(parent,root)
            self.assertEqual(list(load_generated(saved)(torch.zeros(2,3),torch.zeros(2,5)).shape), [2,2])
            parent['edges'].pop()
            self.assertIn('expects 2 inputs',by_id(infer_shapes(parent))['model']['tensorInfo']['message'])
            cycle = write_canvas(root,chain(source(),node('self','IntegratedModel',model_path='.',model_name='cycle'),name='cycle'))
            result = infer_shapes(chain(source(),node('model','IntegratedModel',model_path=str(cycle),model_name='cycle')))
            self.assertIn('Recursive model reference',by_id(result)['model']['tensorInfo']['message'])

    def test_compilation_failure_writes_no_variant_folders(self):
        with tempfile.TemporaryDirectory() as root:
            graph = self.nested(root)
            from source_renderer import generate_code_from_json
            def generate(data, **kwargs):
                if kwargs.get('model_name') == 'parent':
                    raise ValueError('intentional failure')
                return generate_code_from_json(data, **kwargs)
            with patch('model_storage.generate_code_from_json', generate), self.assertRaisesRegex(ValueError, 'intentional'):
                save_model_to_folder(graph, root)
            self.assertFalse((Path(root)/'parent').exists())

    def test_worker_handles_multiple_requests_and_recovers_after_invalid_json(self):
        graph = chain(source(),node('dense','nn.Linear',out_features=3))
        request = json.dumps({'graph':graph})
        result = subprocess.run([sys.executable,'-B',str(UTILS / 'auto_shape_fitting' / 'shape_inference.py'),'--worker'],
                                input=request+'\ninvalid\n'+request+'\n',capture_output=True,text=True,check=True,
                                cwd=tempfile.gettempdir())
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(len(responses),3)
        self.assertIn('error',responses[1])
        self.assertEqual(responses[0],responses[2])


if __name__ == '__main__':
    unittest.main()
