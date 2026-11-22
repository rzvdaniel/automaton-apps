#!/usr/bin/env python3
"""Overseer's lessons Action: runs that one job in the app (POST /api/jobs/lessons). It takes no input."""

import sys

from job import main

if __name__ == "__main__":
    sys.exit(main("lessons"))
