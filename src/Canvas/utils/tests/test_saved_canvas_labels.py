"""Dependency-free regression for inflated legacy integrated-model captions."""
import unittest

from bootstrap import UTILS
from read_canvas.saved_canvas import repair_legacy_labels


class SavedCanvasLabelTests(unittest.TestCase):
    def test_only_corrupt_integrated_labels_are_rebuilt(self):
        inflated = '\u00c3\u0192' * 10000
        child = {'nodes': [{'id': 'ic_1', 'layerType': 'IntegratedModel',
                            'label': inflated, 'params': {'model_name': 'child'}}]}
        canvas = {'nodes': [
            {'id': 'ic_0', 'layerType': 'IntegratedModel', 'label': inflated,
             'params': {'model_name': 'parent', 'model_path': './parent'}, 'adaptedModel': child},
            {'id': 'custom', 'layerType': 'nn.Linear', 'label': inflated},
            {'id': 'ic_2', 'layerType': 'IntegratedModel', 'label': 'My caption'},
        ]}
        repair_legacy_labels(canvas)
        self.assertEqual(canvas['nodes'][0]['label'], 'IC: parent #ic_0')
        self.assertEqual(canvas['nodes'][0]['params']['model_path'], './parent')
        self.assertEqual(child['nodes'][0]['label'], 'IC: child #ic_1')
        self.assertEqual(canvas['nodes'][1]['label'], inflated)
        self.assertEqual(canvas['nodes'][2]['label'], 'My caption')


if __name__ == '__main__':
    unittest.main()
