"""SQLite storage for Release Keeper."""

import json
import os
import sqlite3
from datetime import datetime, timezone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Store:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS releases (
                    version TEXT PRIMARY KEY,
                    released_at TEXT NOT NULL,
                    prod_at TEXT DEFAULT '',
                    test_at TEXT DEFAULT '',
                    verified TEXT DEFAULT 'pending',
                    state TEXT DEFAULT 'ready',
                    notes TEXT DEFAULT '',
                    prs_json TEXT DEFAULT '[]',
                    commits_json TEXT DEFAULT '[]',
                    checks_json TEXT DEFAULT '[]',
                    url TEXT DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS reports (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    headline TEXT NOT NULL,
                    needs_you_count INTEGER DEFAULT 0,
                    state TEXT DEFAULT 'sent',
                    body_md TEXT DEFAULT '',
                    sections_json TEXT DEFAULT '[]',
                    emailed_at TEXT DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS lessons (
                    id TEXT PRIMARY KEY,
                    repo TEXT DEFAULT '',
                    number INTEGER DEFAULT 0,
                    title TEXT NOT NULL,
                    area TEXT DEFAULT 'General',
                    filed_at TEXT NOT NULL,
                    times INTEGER DEFAULT 1,
                    state TEXT DEFAULT 'open',
                    fix TEXT DEFAULT 'Needs triage',
                    change_text TEXT DEFAULT '',
                    rec_text TEXT DEFAULT '',
                    happened_json TEXT DEFAULT '[]',
                    url TEXT DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS lesson_weeks (
                    week TEXT NOT NULL,
                    lesson_id TEXT NOT NULL,
                    count INTEGER DEFAULT 1,
                    PRIMARY KEY (week, lesson_id)
                );
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

    def get_meta(self, key: str, default: str = "") -> str:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else default

    def set_meta(self, key: str, value: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def get_meta_json(self, key: str, default=None):
        raw = self.get_meta(key, "")
        if not raw:
            return default
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default

    def set_meta_json(self, key: str, value) -> None:
        self.set_meta(key, json.dumps(value))

    def upsert_release(self, rel: dict) -> None:
        now = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO releases (version, released_at, prod_at, test_at, verified, state, notes, prs_json, commits_json, checks_json, url, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(version) DO UPDATE SET
                    released_at = excluded.released_at,
                    prod_at = CASE WHEN excluded.prod_at != '' THEN excluded.prod_at ELSE releases.prod_at END,
                    test_at = CASE WHEN excluded.test_at != '' THEN excluded.test_at ELSE releases.test_at END,
                    verified = CASE WHEN releases.verified IN ('passed', 'failed') AND excluded.verified = 'pending' THEN releases.verified ELSE excluded.verified END,
                    state = excluded.state,
                    notes = excluded.notes,
                    prs_json = excluded.prs_json,
                    commits_json = excluded.commits_json,
                    checks_json = excluded.checks_json,
                    url = excluded.url,
                    updated_at = excluded.updated_at
                """,
                (
                    rel["version"],
                    rel["released_at"],
                    rel.get("prod_at", ""),
                    rel.get("test_at", ""),
                    rel.get("verified", "pending"),
                    rel.get("state", "ready"),
                    rel.get("notes", ""),
                    json.dumps(rel.get("prs", [])),
                    json.dumps(rel.get("commits", [])),
                    json.dumps(rel.get("checks", [])),
                    rel.get("url", ""),
                    now,
                ),
            )

    def list_releases(self, f: str = "all", q: str = "", limit: int = 20, offset: int = 0) -> dict:
        where = ["1=1"]
        params: list = []
        if f == "ready":
            where.append("state = 'ready'")
        elif f == "deployed":
            where.append("state = 'deployed'")
        elif f == "failed":
            where.append("verified = 'failed'")
        if q:
            where.append("(version LIKE ? OR notes LIKE ?)")
            like = f"%{q}%"
            params.extend([like, like])

        sql_where = " AND ".join(where)
        with self._connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM releases WHERE {sql_where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM releases WHERE {sql_where} ORDER BY released_at DESC LIMIT ? OFFSET ?",
                [*params, limit, offset],
            ).fetchall()
            counts = {
                "all": conn.execute("SELECT COUNT(*) FROM releases").fetchone()[0],
                "ready": conn.execute("SELECT COUNT(*) FROM releases WHERE state = 'ready'").fetchone()[0],
                "deployed": conn.execute("SELECT COUNT(*) FROM releases WHERE state = 'deployed'").fetchone()[0],
                "failed": conn.execute("SELECT COUNT(*) FROM releases WHERE verified = 'failed'").fetchone()[0],
            }
        return {"items": [self._row_to_release(r) for r in rows], "total": total, "counts": counts}

    def get_release(self, version: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM releases WHERE version = ?", (version,)).fetchone()
            return self._row_to_release(row) if row else None

    @staticmethod
    def _row_to_release(row: sqlite3.Row) -> dict:
        return {
            "version": row["version"],
            "released_at": row["released_at"],
            "prod_at": row["prod_at"],
            "test_at": row["test_at"],
            "verified": row["verified"],
            "state": row["state"],
            "notes": row["notes"],
            "prs": json.loads(row["prs_json"] or "[]"),
            "commits": json.loads(row["commits_json"] or "[]"),
            "checks": json.loads(row["checks_json"] or "[]"),
            "url": row["url"],
            "updated_at": row["updated_at"],
        }

    def upsert_report(self, rep: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO reports (id, created_at, kind, headline, needs_you_count, state, body_md, sections_json, emailed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    created_at = excluded.created_at,
                    kind = excluded.kind,
                    headline = excluded.headline,
                    needs_you_count = excluded.needs_you_count,
                    state = excluded.state,
                    body_md = excluded.body_md,
                    sections_json = excluded.sections_json,
                    emailed_at = CASE WHEN excluded.emailed_at != '' THEN excluded.emailed_at ELSE reports.emailed_at END
                """,
                (
                    rep["id"],
                    rep["created_at"],
                    rep["kind"],
                    rep["headline"],
                    int(rep.get("needs_you_count", 0)),
                    rep.get("state", "sent"),
                    rep.get("body_md", ""),
                    json.dumps(rep.get("sections", [])),
                    rep.get("emailed_at", ""),
                ),
            )

    def list_reports(self, f: str = "all", q: str = "", date: str = "", limit: int = 20, offset: int = 0) -> dict:
        where = ["1=1"]
        params: list = []
        if f == "morning":
            where.append("kind = 'morning'")
        elif f == "eod":
            where.append("kind = 'eod'")
        elif f == "attn":
            where.append("needs_you_count > 0")
        if date:
            where.append("created_at LIKE ?")
            params.append(f"{date}%")
        if q:
            where.append("(headline LIKE ? OR body_md LIKE ? OR id LIKE ?)")
            like = f"%{q}%"
            params.extend([like, like, like])

        sql_where = " AND ".join(where)
        with self._connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM reports WHERE {sql_where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM reports WHERE {sql_where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                [*params, limit, offset],
            ).fetchall()
            counts = {
                "all": conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0],
                "morning": conn.execute("SELECT COUNT(*) FROM reports WHERE kind = 'morning'").fetchone()[0],
                "eod": conn.execute("SELECT COUNT(*) FROM reports WHERE kind = 'eod'").fetchone()[0],
                "attn": conn.execute("SELECT COUNT(*) FROM reports WHERE needs_you_count > 0").fetchone()[0],
            }
        return {"items": [self._row_to_report(r) for r in rows], "total": total, "counts": counts}

    def get_report(self, report_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
            return self._row_to_report(row) if row else None

    @staticmethod
    def _row_to_report(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "kind": row["kind"],
            "headline": row["headline"],
            "needs_you_count": row["needs_you_count"],
            "state": row["state"],
            "body_md": row["body_md"],
            "sections": json.loads(row["sections_json"] or "[]"),
            "emailed_at": row["emailed_at"],
        }

    def upsert_lesson(self, les: dict) -> None:
        now = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO lessons (id, repo, number, title, area, filed_at, times, state, fix, change_text, rec_text, happened_json, url, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    area = excluded.area,
                    times = excluded.times,
                    state = CASE WHEN lessons.state IN ('later', 'dropped', 'fixed') AND excluded.state = 'open' THEN lessons.state ELSE excluded.state END,
                    fix = CASE WHEN lessons.state IN ('later', 'dropped', 'fixed') AND excluded.state = 'open' THEN lessons.fix ELSE excluded.fix END,
                    change_text = excluded.change_text,
                    rec_text = excluded.rec_text,
                    happened_json = excluded.happened_json,
                    url = excluded.url,
                    updated_at = excluded.updated_at
                """,
                (
                    les["id"],
                    les.get("repo", ""),
                    int(les.get("number", 0)),
                    les["title"],
                    les.get("area", "General"),
                    les["filed_at"],
                    int(les.get("times", 1)),
                    les.get("state", "open"),
                    les.get("fix", "Needs triage"),
                    les.get("change_text", ""),
                    les.get("rec_text", ""),
                    json.dumps(les.get("happened", [])),
                    les.get("url", ""),
                    now,
                ),
            )
            week = les["filed_at"][:10]
            conn.execute(
                "INSERT INTO lesson_weeks (week, lesson_id, count) VALUES (?, ?, ?) ON CONFLICT(week, lesson_id) DO UPDATE SET count = excluded.count",
                (week, les["id"], int(les.get("times", 1))),
            )

    def triage_lesson(self, lesson_id: str, action: str) -> dict | None:
        mapping = {
            "fix_now": ("triaged", "Fix now"),
            "later": ("later", "Later"),
            "drop": ("dropped", "Dropped"),
        }
        if action not in mapping:
            return None
        state, fix = mapping[action]
        now = utc_now_iso()
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE lessons SET state = ?, fix = ?, updated_at = ? WHERE id = ?",
                (state, fix, now, lesson_id),
            )
            if cur.rowcount == 0:
                return None
        return self.get_lesson(lesson_id)

    def list_lessons(self, f: str = "all", area: str = "", q: str = "", limit: int = 20, offset: int = 0) -> dict:
        where = ["1=1"]
        params: list = []
        if f == "open":
            where.append("state = 'open'")
        elif f == "repeat":
            where.append("times > 1")
        elif f == "fixed":
            where.append("state = 'fixed'")
        if area:
            where.append("area = ?")
            params.append(area)
        if q:
            where.append("(title LIKE ? OR id LIKE ? OR area LIKE ? OR change_text LIKE ?)")
            like = f"%{q}%"
            params.extend([like, like, like, like])

        sql_where = " AND ".join(where)
        with self._connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM lessons WHERE {sql_where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM lessons WHERE {sql_where} ORDER BY filed_at DESC LIMIT ? OFFSET ?",
                [*params, limit, offset],
            ).fetchall()
            areas = [r[0] for r in conn.execute("SELECT DISTINCT area FROM lessons ORDER BY area").fetchall()]
            counts = {
                "all": conn.execute("SELECT COUNT(*) FROM lessons").fetchone()[0],
                "open": conn.execute("SELECT COUNT(*) FROM lessons WHERE state = 'open'").fetchone()[0],
                "repeat": conn.execute("SELECT COUNT(*) FROM lessons WHERE times > 1").fetchone()[0],
                "fixed": conn.execute("SELECT COUNT(*) FROM lessons WHERE state = 'fixed'").fetchone()[0],
            }
        return {"items": [self._row_to_lesson(r) for r in rows], "total": total, "areas": areas, "counts": counts}

    def get_lesson(self, lesson_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
            return self._row_to_lesson(row) if row else None

    @staticmethod
    def _row_to_lesson(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "repo": row["repo"],
            "number": row["number"],
            "title": row["title"],
            "area": row["area"],
            "filed_at": row["filed_at"],
            "times": row["times"],
            "state": row["state"],
            "fix": row["fix"],
            "change_text": row["change_text"],
            "rec_text": row["rec_text"],
            "happened": json.loads(row["happened_json"] or "[]"),
            "url": row["url"],
            "updated_at": row["updated_at"],
        }
