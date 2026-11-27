#!/bin/sh
set -eu
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
python -m unittest discover -p 'test_*.py'
(cd "$ROOT" && python tools/smoke_build.py maintenance/head-counter)
