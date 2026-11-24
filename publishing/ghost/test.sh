#!/bin/sh
# How this app tests itself; .github/workflows/app-tests.yml runs it from the app folder (python 3.12).
set -eu
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
sh -n run.sh
python3 -m json.tool automaton.json > /dev/null
