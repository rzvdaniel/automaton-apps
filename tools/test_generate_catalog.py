import json
import unittest

import generate_catalog as g


class CatalogTests(unittest.TestCase):
    def test_built_catalog_is_valid(self):
        catalog = g.build()
        self.assertEqual(g.problems(catalog), [])
        self.assertEqual(catalog["schemaVersion"], 1)
        self.assertTrue(any(app["id"] == "offsite-backup" for app in catalog["apps"]))

    def test_missing_setting_descriptions_are_found_but_never_fail_the_catalog(self):
        found = g.missing_descriptions()
        self.assertTrue(all(len(item) == 2 and item[0].endswith("automaton.json") for item in found))
        self.assertEqual(g.problems(g.build()), [])

    def test_permissions_come_from_the_manifest(self):
        app = next(a for a in g.build()["apps"] if a["id"] == "offsite-backup")
        self.assertEqual(app["permissions"], ["backups:read", "backups:run", "notify:email"])

    def test_only_flagged_apps_are_recommended(self):
        apps = {a["id"]: a for a in g.build()["apps"]}
        self.assertTrue(apps["server-console"]["recommended"])
        self.assertNotIn("recommended", apps["heartbeat"])
        self.assertNotIn("recommendedOrder", apps["heartbeat"])

    def test_recommended_apps_carry_their_order(self):
        apps = {a["id"]: a for a in g.build()["apps"]}
        self.assertEqual(apps["server-console"]["recommendedOrder"], 1)

    def test_moved_from_is_passed_through_and_must_name_an_official_folder(self):
        entry = {"id": "x", "name": "X", "summary": "s", "category": "C", "folder": "a/b", "commit": "a" * 40, "minServerVersion": "1.2.3"}
        good = {"apps": [dict(entry, movedFrom={"repo": g.OFFICIAL_REPO, "folder": "analytics/x"})]}
        other = {"apps": [dict(entry, movedFrom={"repo": "someone/else", "folder": "analytics/x"})]}
        self.assertEqual(g.problems(good), [])
        self.assertEqual(len(g.problems(other)), 1)

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
