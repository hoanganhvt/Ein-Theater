import os
import sys
import json
import re
from typing import Optional, Dict, Any

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)


def find_modules_json_path() -> Optional[str]:
    """
    Dynamically finds the path to modules.json across multiple
    candidate relative and working directory locations.
    """
    curr = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(curr, '..', '..', 'data', 'modules.json'),
        os.path.join(curr, '..', '..', 'static', 'data', 'modules.json'),
        os.path.join(curr, '..', '..', '..', 'src', 'Canvas', 'data', 'modules.json'),
        os.path.join(curr, '..', '..', '..', 'src', 'data', 'modules.json'),
        os.path.join(curr, '..', '..', '..', 'src', 'static', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'src', 'Canvas', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'Canvas', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'src', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'src', 'static', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'data', 'modules.json'),
    ]
    for c in candidates:
        norm = os.path.normpath(c)
        if os.path.exists(norm):
            return norm
    return None


def load_modules_map() -> Dict[str, Any]:
    """
    Loads and returns a dictionary of layer type -> module definition
    from modules.json, or empty dict if not found.
    """
    path = find_modules_json_path()
    if path:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                mods = json.load(f)
                return {m['type']: m for m in mods}
        except Exception:
            pass
    return {}


def fix_model_name(name: str) -> str:
    """
    Validates and fixes an invalid model name:
    - If the model name has space, replace space with _
    - If the model name has number before the text, add the word model_ infront of it
    - Ensures valid characters for python identifier / folder name
    """
    if not name or not name.strip():
        return "model"
    name = name.strip()

    # If the model name has space, replace space with _
    if ' ' in name:
        name = name.replace(' ', '_')

    # If the model name has number before the text
    has_num_before = False
    for ch in name:
        if ch.isdigit():
            has_num_before = True
            break
        if ch.isalpha():
            break

    if has_num_before:
        name = f"model_{name}"

    # Ensure valid characters for python identifier / folder name
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if not name:
        return "model"
    if not name[0].isalpha():
        name = f"model_{name.lstrip('_')}"
        if name == "model_":
            name = "model"
    return name


def fix_input_name(name: str, fallback_idx: int = 0) -> str:
    """
    Validates and fixes an input variable name into a valid Python identifier:
    - If the user didn't do anything (empty or default like 'input', 'input 0', 'input_0'),
      it defaults to 'x{fallback_idx}' (e.g. x0, x1, x2...).
    - If the input name has space or hyphen, replaces with _
    - If the input name starts with a number, prepends x_ (just like fix_model_name)
    - Strips invalid characters (replaces with _)
    - Ensures valid identifier starting with a letter
    - Protects against Python reserved keywords (e.g. def, class, for)
    """
    default_name = f"x{fallback_idx}"
    if not name or not str(name).strip():
        return default_name

    raw = str(name).strip()

    # Check if user left default block naming like "input", "input 0", "input_0", "input 1"
    raw_lower = raw.lower()
    if raw_lower in ('input', 'input_block') or re.match(r'^input[\s_]*\d*$', raw_lower):
        return default_name

    # If the input name has spaces or hyphens, replace with _
    clean = raw.replace(' ', '_').replace('-', '_')

    # If the input name has number before the text (starts with a digit), prepend x_
    has_num_before = False
    for ch in clean:
        if ch.isdigit():
            has_num_before = True
            break
        if ch.isalpha():
            break

    if has_num_before:
        clean = f"x_{clean}"

    # Ensure valid characters for Python identifier
    clean = re.sub(r'[^a-zA-Z0-9_]', '_', clean)
    clean = re.sub(r'_+', '_', clean)

    if not clean:
        return default_name

    if not clean[0].isalpha():
        clean = f"x_{clean.lstrip('_')}"
        if clean in ("x_", "x"):
            return default_name

    clean = clean.strip('_')
    if not clean:
        return default_name

    import keyword
    if keyword.iskeyword(clean):
        clean = f"{clean}_input"

    return clean

