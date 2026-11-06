import json
import unittest

import generate_catalog as g


class CatalogTests(unittest.TestCase):
    def test_built_catalog_is_valid(self):
        catalog = g.build()
        self.assertEqual(g.problems(catalog), [])
        self.assertEqual(catalog["schemaVersion"], 1)
        self.assertTrue(any(app["id"] == "offsite-backup" for app in catalog["apps"]))

    def test_permissions_come_from_the_manifest(self):
        app = next(a for a in g.build()["apps"] if a["id"] == "offsite-backup")
        self.assertEqual(app["permissions"], ["backups:read"])

    def test_problems_report_bad_entries(self):
        bad = {"apps": [{"id": "x", "name": "X", "summary": "", "category": "C", "folder": "a/b", "commit": "abc", "minServerVersion": "1"}]}
        self.assertEqual(len(g.problems(bad)), 3)

    def test_folder_names_servers_would_reject_are_reported(self):
        bad = {"apps": [{"id": "x", "name": "X", "summary": "s", "category": "C", "folder": "a/./b", "commit": "a" * 40, "minServerVersion": "1.2.3"}]}
        self.assertEqual(len(g.problems(bad)), 1)

    def test_committed_catalog_is_valid_and_lives_at_the_repository_root(self):
        committed = g.ROOT / "catalog.json"
        self.assertTrue(committed.exists(), "catalog.json must be committed in main")
        catalog = json.loads(committed.read_text(encoding="utf-8"))
        self.assertEqual(catalog["schemaVersion"], 1)
        self.assertEqual(g.problems(catalog), [])


if __name__ == "__main__":
    unittest.main()
