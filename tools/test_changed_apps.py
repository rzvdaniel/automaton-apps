import unittest
from pathlib import Path
import changed_apps, check_manifests

APPS = ["maintenance/a", "maintenance/b"]


class Select(unittest.TestCase):
    def test_only_the_changed_app(self):
        self.assertEqual(changed_apps.select(APPS, ["maintenance/a/main.py"]), ["maintenance/a"])

    def test_docs_outside_apps_run_nothing(self):
        self.assertEqual(changed_apps.select(APPS, ["README.md"]), [])

    def test_tools_run_all(self):
        self.assertEqual(changed_apps.select(APPS, ["tools/x.py"]), APPS)

    def test_kit_runs_apps_with_ui(self):
        got = changed_apps.select(APPS, ["design/automaton-app-ui/app.css"], lambda f: f.endswith("b"))
        self.assertEqual(got, ["maintenance/b"])

    def test_similar_prefix_is_not_the_app(self):
        self.assertEqual(changed_apps.select(APPS, ["maintenance/ab/x.py"]), [])


class Manifests(unittest.TestCase):
    def test_every_real_app_passes(self):
        for folder in changed_apps.app_folders():
            self.assertEqual(check_manifests.problems(check_manifests.ROOT / folder), [], folder)

    def test_missing_pieces(self):
        import tempfile, json
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "automaton.json").write_text(json.dumps({"name": "x", "application": {}}))
            got = check_manifests.problems(Path(tmp))
            self.assertEqual(len(got), 3, got)


if __name__ == "__main__":
    unittest.main()
