# Standard library only (the schema check also needs jsonschema, and is skipped without it).
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import gate
import main

NOW = gate.parse_time("2026-11-18T12:00:00Z")


def payload():
    return {"generatedAtUtc": "2026-11-18T12:00:00Z", "reported": True, "running": True, "reportAgeSeconds": 40,
            "bannedLastHour": 3, "bannedLast24Hours": 13, "jails": [
                {"name": "sshd", "enabled": True, "bannedLastHour": 3, "bannedLast24Hours": 12, "currentBans": [
                    {"ip": "203.0.113.9", "bannedAtUtc": "2026-11-18T11:55:00.1234567Z", "expiresAtUtc": "2026-11-18T12:55:00Z"},
                    {"ip": "198.51.100.2", "bannedAtUtc": "2026-11-18T09:00:00Z", "expiresAtUtc": "2026-11-18T11:59:00Z"},
                    {"ip": "<script>", "bannedAtUtc": "2026-11-18T09:00:00Z", "expiresAtUtc": None}]},
                {"name": "recidive", "enabled": True, "bannedLastHour": 0, "bannedLast24Hours": 1, "currentBans": [
                    {"ip": "2001:db8::1", "bannedAtUtc": "2026-11-18T11:00:00Z", "expiresAtUtc": None}]},
                {"name": "quiet", "enabled": False, "bannedLastHour": 0, "bannedLast24Hours": 0, "currentBans": []}]}


class NormalizeTests(unittest.TestCase):
    def test_expired_and_invalid_bans_are_dropped_and_permanent_ones_kept(self):
        figures = gate.normalize(payload(), NOW)
        sshd, recidive, quiet = figures["jails"]
        self.assertEqual([b["ip"] for b in sshd["bans"]], ["203.0.113.9"])
        self.assertEqual(sshd["bans"][0]["bannedAt"], "2026-11-18T11:55:00Z")
        self.assertIsNone(recidive["bans"][0]["expiresAt"])
        self.assertEqual((sshd["banned"], quiet["enabled"]), (1, False))
        self.assertEqual(gate.totals(figures), {"banned": 2, "lastHour": 3, "last24Hours": 13})

    def test_garbage_does_not_crash(self):
        figures = gate.normalize({"jails": [1, {"name": None, "currentBans": [None, {"ip": 5}]}]}, NOW)
        self.assertEqual(figures["jails"][0]["bans"], [])

    def test_the_number_of_listed_bans_is_capped_but_counted(self):
        bans = [{"ip": f"10.0.{i // 250}.{i % 250 + 1}", "bannedAtUtc": "2026-11-18T11:00:00Z", "expiresAtUtc": None} for i in range(300)]
        jail = gate.normalize({"jails": [{"name": "x", "currentBans": bans}]}, NOW)["jails"][0]
        self.assertEqual((jail["banned"], len(jail["bans"])), (300, gate.MAX_BANS_PER_JAIL))


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def read(self, n=-1):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class ServerReadTests(unittest.TestCase):
    def read(self, env, opener):
        from unittest import mock
        with mock.patch.object(gate, "build_opener", lambda *a: type("O", (), {"open": staticmethod(opener)})):
            return gate.read_server(gate.Settings(env), NOW)

    def test_it_calls_the_security_endpoint_with_the_key(self):
        seen = []

        def opener(request, timeout=0):
            seen.append((request.full_url, request.get_header("Authorization")))
            return FakeResponse(json.dumps(payload()).encode())
        status, figures, _ = self.read({"AUTOMATON_APP_ID": "a", "AUTOMATON_API_URL": "https://api.x/", "APP_AUTOMATON_API_KEY": "k"}, opener)
        self.assertEqual((status, seen), ("ok", [("https://api.x/api/server/security/fail2ban", "Bearer k")]))
        self.assertEqual(len(figures["jails"]), 3)

    def test_no_key_and_403_and_errors_say_why(self):
        self.assertEqual(self.read({"AUTOMATON_APP_ID": "a"}, None)[0], "no_key")
        env = {"AUTOMATON_APP_ID": "a", "AUTOMATON_API_URL": "https://api.x", "APP_AUTOMATON_API_KEY": "k"}

        def forbidden(request, timeout=0):
            raise HTTPError(request.full_url, 403, "x", {}, None)

        def broken(request, timeout=0):
            raise HTTPError(request.full_url, 502, "x", {}, None)
        self.assertEqual(self.read(env, forbidden)[0], "not_approved")
        status, _, message = self.read(env, broken)
        self.assertEqual(status, "unavailable")
        self.assertNotIn("api.x", message)
        self.assertEqual(self.read(env, lambda r, timeout=0: FakeResponse(b"[1]"))[0], "unavailable")


class DatabaseTests(unittest.TestCase):
    def make(self, directory):
        path = os.path.join(directory, "f.sqlite3")
        db = sqlite3.connect(path)
        db.executescript("CREATE TABLE jails(name TEXT, enabled INT); CREATE TABLE bans(jail TEXT, ip TEXT, timeofban INT, bantime INT, bancount INT, data TEXT);")
        db.execute("INSERT INTO jails VALUES('sshd',1),('off',0)")
        rows = [("sshd", "203.0.113.9", NOW - 600, 3600), ("sshd", "203.0.113.9", NOW - 90000, 600), ("sshd", "198.51.100.2", NOW - 7200, 3600),
                ("sshd", "192.0.2.7", NOW - 5 * 86400, -1)]
        db.executemany("INSERT INTO bans VALUES(?,?,?,?,1,'{}')", rows)
        db.commit()
        db.close()
        return path

    def test_it_reads_current_bans_and_counts_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.make(directory)
            pid = os.path.join(directory, "f.pid")
            open(pid, "w").close()
            status, figures, _ = gate.read_database(gate.Settings({"FAIL2BAN_DB": path, "FAIL2BAN_PID": pid}), NOW)
            self.assertEqual(status, "ok")
            self.assertTrue(figures["running"])
            sshd = next(j for j in figures["jails"] if j["name"] == "sshd")
            self.assertEqual(sorted(b["ip"] for b in sshd["bans"]), ["192.0.2.7", "203.0.113.9"])  # the 2-hour-old 1-hour ban is over
            self.assertEqual((sshd["lastHour"], sshd["last24Hours"]), (1, 2))
            self.assertIsNone(next(b for b in sshd["bans"] if b["ip"] == "192.0.2.7")["expiresAt"])
            self.assertFalse(gate.read_database(gate.Settings({"FAIL2BAN_DB": path, "FAIL2BAN_PID": pid + "x"}), NOW)[1]["running"])
            with self.assertRaises(sqlite3.OperationalError):  # the app's own connection mode cannot write
                sqlite3.connect("file:" + path + "?mode=ro", uri=True).execute("DELETE FROM bans")

    def test_a_missing_or_broken_database_says_so(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(gate.read_database(gate.Settings({"FAIL2BAN_DB": os.path.join(directory, "none")}), NOW)[0], "unavailable")
            bad = os.path.join(directory, "bad")
            open(bad, "w").write("not a database")
            status, _, message = gate.read_database(gate.Settings({"FAIL2BAN_DB": bad}), NOW)
            self.assertEqual(status, "unavailable")
            self.assertNotIn(directory, message)


def state_from(raw, status="ok"):
    return gate.view(status, gate.normalize(raw, NOW) if raw else None, "", NOW)


class CardTests(unittest.TestCase):
    schema = None

    @classmethod
    def setUpClass(cls):
        try:
            import jsonschema
        except ImportError:
            return
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "testdata", "home-card.schema.json")
        with open(path) as handle:
            cls.schema, cls.jsonschema = json.load(handle), jsonschema

    def check(self, card):
        if self.schema:
            self.jsonschema.Draft202012Validator(self.schema).validate(card)
        return card

    def test_card_has_counts_and_jails_but_no_addresses(self):
        card = self.check(gate.build_card(state_from(payload())))
        self.assertEqual((card["status"], card["tone"]), ("2 addresses banned", "ok"))
        text = json.dumps(card)
        for secret in ("203.0.113.9", "2001:db8"):
            self.assertNotIn(secret, text)
        self.assertEqual(card["blocks"][0]["items"][0], {"label": "Banned now", "value": 2, "tone": "info"})
        self.assertEqual(card["blocks"][1]["rows"][0], {"text": "sshd", "note": "1 now, 12 in 24 h"})
        self.assertEqual(card["blocks"][-1]["items"], [{"label": "Open", "path": "/"}])

    def test_empty_not_running_unreported_and_waiting(self):
        quiet = payload()
        quiet["jails"] = []
        self.assertEqual(self.check(gate.build_card(state_from(quiet)))["status"], "No active bans")
        down = payload()
        down["running"] = False
        self.assertEqual(self.check(gate.build_card(state_from(down)))["tone"], "warning")
        self.assertEqual(self.check(gate.build_card(state_from({"reported": False})))["status"], "No figures yet")
        self.assertEqual(self.check(gate.build_card(state_from(None, "not_approved")))["status"], "Waiting for approval")
        self.assertEqual(self.check(gate.build_card(state_from(None, "unavailable")))["tone"], "warning")

    def test_many_jails_stay_inside_the_schema(self):
        raw = payload()
        raw["jails"] = [{"name": "j" * 200 + str(i), "enabled": True, "bannedLastHour": 1, "bannedLast24Hours": 1, "currentBans": []} for i in range(20)]
        self.check(gate.build_card(state_from(raw)))


class ServerTests(unittest.TestCase):
    def start(self, env):
        app = main.Gate(env)
        app.cached = (10 ** 12, state_from(payload()))  # never expires: no network
        server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(app))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        return "http://127.0.0.1:%d" % server.server_port

    def get(self, base, path, token=None):
        headers = {"Authorization": "Bearer " + token} if token else {}
        try:
            with urlopen(Request(base + path, headers=headers)) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    def test_inside_automaton_the_page_data_is_served_without_a_token(self):
        base = self.start({"AUTOMATON_APP_ID": "a"})
        self.assertEqual(self.get(base, "/api/state")[0], 200)
        self.assertEqual(self.get(base, "/api/home-card")[0], 200)
        self.assertEqual(self.get(base, "/health")[0], 200)

    def test_on_its_own_the_admin_token_is_required(self):
        token = "t" * 16
        base = self.start({"ADMIN_TOKEN": token})
        self.assertEqual(self.get(base, "/api/state")[0], 401)
        self.assertEqual(self.get(base, "/api/state", "wrong")[0], 401)
        self.assertEqual(self.get(base, "/api/home-card", token)[0], 200)
        self.assertEqual(self.get(base, "/")[0], 200)  # the page itself holds no data and asks for the token

    def test_without_a_long_enough_token_nothing_is_shown(self):
        for env in ({}, {"ADMIN_TOKEN": "short"}):
            base = self.start(env)
            status, body = self.get(base, "/api/state", env.get("ADMIN_TOKEN") or "x")
            self.assertEqual(status, 401)
            self.assertIn(b"ADMIN_TOKEN", body)

    def test_nothing_else_is_served(self):
        base = self.start({"AUTOMATON_APP_ID": "a"})
        for path in ("/main.py", "/gate.py", "/../main.py", "/data/state.json"):
            self.assertEqual(self.get(base, path)[0], 404)


if __name__ == "__main__":
    unittest.main()
