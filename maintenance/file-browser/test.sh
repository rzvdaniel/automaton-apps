#!/bin/sh
# How this app tests itself; .github/workflows/app-tests.yml runs it from the app folder (python 3.12).
set -eu
cd "$(dirname "$0")"
python -m unittest discover -p 'test_*.py'
