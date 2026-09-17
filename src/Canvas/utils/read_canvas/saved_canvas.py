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
    return canvas


