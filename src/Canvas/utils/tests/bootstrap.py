"""Locate utility packages when unittest discovers tests from any directory."""
from pathlib import Path
import sys

UTILS = Path(__file__).resolve().parent.parent
GENERATOR = UTILS / 'generate code'
for directory in (UTILS, GENERATOR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))
