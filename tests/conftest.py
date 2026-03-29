import os
import sys

# Ensure the project root is on sys.path so modules load in pytest
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
