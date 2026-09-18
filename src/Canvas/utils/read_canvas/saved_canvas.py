"""Load the editable canvas from a saved model folder."""
import json
from pathlib import Path
from shared.common import fix_model_name

def read_canvas(folder):
    folder = Path(folder).resolve(strict=True)
    path = folder / (folder.name + '.json')
    if not path.is_file():
        path = folder / (fix_model_name(folder.name) + '.json')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    canvas = data.get('canvas', data)
    if not canvas.get('nodes') or any(not n.get('layerType') for n in canvas['nodes']):
        raise ValueError('Integrated model requires an editable saved canvas with layer types')
    canvas.setdefault('name', fix_model_name(folder.name))
    repair_legacy_labels(canvas)
    return canvas


def repair_legacy_labels(canvas):
    """Repair inflated legacy IC captions in memory without changing model semantics."""
    for node in canvas.get('nodes', []):
        label = node.get('label', '')
        if (node.get('layerType') == 'IntegratedModel'
                and isinstance(label, str) and len(label) > 4096
                and label.startswith('\u00c3')):
            name = (node.get('params') or {}).get('model_name') or 'Integrated Model'
            node['label'] = f"IC: {name} #{node.get('id', '')}"
        adapted = node.get('adaptedModel')
        if isinstance(adapted, dict):
            repair_legacy_labels(adapted)


