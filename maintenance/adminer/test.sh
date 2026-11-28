#!/bin/sh
# How this app tests itself; .github/workflows/app-tests.yml runs it from the app folder (python 3.12).
set -eu
cd "$(dirname "$0")"
sh -n run.sh
python3 -m json.tool automaton.json > /dev/null
python3 -m unittest discover -p 'test_*.py'
