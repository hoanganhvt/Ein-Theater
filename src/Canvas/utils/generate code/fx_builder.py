"""Build the FX forward graph and module constructor statements."""
import operator
import torch
from torch import fx


def build_fx_graph(nodes):
    graph = fx.Graph()
    env = {}
    init_lines = []

    for node in nodes:
        op = node['op']
        nid = node['id']
        target = node.get('target', nid)

        if op == 'placeholder':
            env[nid] = graph.placeholder(target)

        elif op == 'call_module':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            if node.get('in_forward', True):
                env[nid] = graph.call_module(target, args=tuple(inputs))

            codeTemplate = node.get('codeTemplate', '')
            params = node.get('params', {})
            if node.get('constructorResolved'):
                instantiation = codeTemplate
                init_lines.append(f"        self.{target} = {instantiation}")
            elif codeTemplate:
                try:
                    instantiation = codeTemplate.format(**params)
                except KeyError:
                    instantiation = codeTemplate
                init_lines.append(f"        self.{target} = {instantiation}")
            else:
                layer_type = node.get('layer_type', 'nn.Identity')
                init_lines.append(f"        self.{target} = {layer_type}()")

        elif op == 'call_function':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            if target == 'cat':
                dim = node.get('params', {}).get('dim', 1)
                try:
                    dim = int(dim)
                except (ValueError, TypeError):
                    dim = 1
                env[nid] = graph.call_function(torch.cat, args=(inputs,), kwargs={'dim': dim})
            elif target == 'add':
                if len(inputs) == 0:
                    pass
                elif len(inputs) == 1:
                    env[nid] = inputs[0]
                elif len(inputs) == 2:
                    env[nid] = graph.call_function(torch.add, args=tuple(inputs))
                else:
                    acc = inputs[0]
                    for inp in inputs[1:]:
                        acc = graph.call_function(torch.add, args=(acc, inp))
                    env[nid] = acc
            elif target == 'getitem':
                env[nid] = graph.call_function(operator.getitem, args=(inputs[0], node.get('params', {}).get('index', 0)))
            elif target == 'mul':
                env[nid] = graph.call_function(torch.mul, args=tuple(inputs))
            else:
                func = getattr(torch, target, getattr(torch.nn.functional, target, None))
                if func:
                    env[nid] = graph.call_function(func, args=tuple(inputs))
                else:
                    env[nid] = graph.call_function(torch.add, args=tuple(inputs))

        elif op == 'accumulate':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            env[nid] = graph.call_function(torch.add, args=tuple(inputs))

        elif op == 'assign':
            if node.get('inputs') and node['inputs'][0] in env:
                env[nid] = env[node['inputs'][0]]

        elif op == 'output':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            if len(inputs) == 1:
                graph.output(inputs[0])
            elif len(inputs) > 1:
                graph.output(tuple(inputs))

    return graph, init_lines
