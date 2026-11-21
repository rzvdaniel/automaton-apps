import json
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


class BuildCopiesWhatTheAppReadsTests(unittest.TestCase):
    """The app runs from dist/; a file it reads that the build does not copy only fails on deploy (apps#405)."""

    def copied(self):
        with open(os.path.join(HERE, "automaton.json")) as handle:
            command = " ".join(json.load(handle)["application"]["build"]["command"]["arguments"])
        files = set()
        for match in re.finditer(r"cp ([^&]+?) (dist/[^ &]*)", command):
            *sources, target = match.group(1).split() + [match.group(2)]
            for source in sources:
                files.add(source if target.rstrip("/") == "dist" else "ui/" + os.path.basename(source))
        return files

    def test_every_file_main_reads_and_every_module_it_imports_is_copied(self):
        import main
        read = {entry[0].replace(os.sep, "/") for entry in main.STATIC.values()}
        with open(os.path.join(HERE, "main.py")) as handle:
            modules = {name + ".py" for name in re.findall(r"^import (backup|offsite)$", handle.read(), re.M)}
        missing = (read | modules | {"main.py"}) - self.copied()
        self.assertEqual(missing, set())
