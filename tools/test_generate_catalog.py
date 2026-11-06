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
        bad = {"apps": [{"id": "x", "name": "X", "summary": "", "category": "C", "commit": "abc", "minServerVersion": "1"}]}
        self.assertEqual(len(g.problems(bad)), 3)


if __name__ == "__main__":
    unittest.main()
