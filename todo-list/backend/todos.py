from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

DATA_DIR = Path(__file__).resolve().parent / "data"
LEGACY_DATA_FILE = DATA_DIR / "todos.json"
DB_FILE = DATA_DIR / "todos.db"


def _ok(data: dict) -> dict:
    return {"success": True, "data": data, "error": ""}


def _fail(message: str) -> dict:
    return {"success": False, "data": None, "error": message}


class TodosController:
    def __init__(self) -> None:
        self._ensure_database()

    def list(self, _inputs: dict) -> dict:
        return _ok({"items": self._load_items()})

    def create(self, inputs: dict) -> dict:
        title = str(inputs.get("title", "")).strip()
        if not title:
            return _fail("title is required")

        items = self._load_items()
        items.insert(
            0,
            {
                "id": str(uuid4()),
                "title": title,
                "completed": False,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            },
        )
        self._save_items(items)
        return _ok({"items": items})

    def toggle(self, inputs: dict) -> dict:
        todo_id = str(inputs.get("id", "")).strip()
        if not todo_id:
            return _fail("id is required")

        items = self._load_items()
        for item in items:
            if item["id"] == todo_id:
                item["completed"] = not item["completed"]
                self._save_items(items)
                return _ok({"items": items})
        return _fail("Todo not found")

    def remove(self, inputs: dict) -> dict:
        todo_id = str(inputs.get("id", "")).strip()
        if not todo_id:
            return _fail("id is required")

        items = self._load_items()
        filtered_items = [item for item in items if item["id"] != todo_id]
        if len(filtered_items) == len(items):
            return _fail("Todo not found")

        self._save_items(filtered_items)
        return _ok({"items": filtered_items})

    def clear_completed(self, _inputs: dict) -> dict:
        items = [item for item in self._load_items() if not item["completed"]]
        self._save_items(items)
        return _ok({"items": items})

    def _load_items(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, title, completed, created_at
                FROM todos
                ORDER BY datetime(created_at) DESC, rowid DESC
                """
            ).fetchall()

        return [
            {
                "id": row["id"],
                "title": row["title"],
                "completed": bool(row["completed"]),
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def _save_items(self, items: list[dict]) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM todos")
            connection.executemany(
                """
                INSERT INTO todos (id, title, completed, created_at)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        item["id"],
                        item["title"],
                        1 if item["completed"] else 0,
                        item["createdAt"],
                    )
                    for item in items
                ],
            )
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_FILE)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_database(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS todos (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )
            has_rows = connection.execute("SELECT COUNT(*) FROM todos").fetchone()[0] > 0
            connection.commit()

        if has_rows or not LEGACY_DATA_FILE.exists():
            return

        import json

        with LEGACY_DATA_FILE.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        if not isinstance(data, list):
            return

        sanitized_items = []
        for item in data:
            if not isinstance(item, dict):
                continue

            title = str(item.get("title", "")).strip()
            todo_id = str(item.get("id", "")).strip() or str(uuid4())
            created_at = str(item.get("createdAt", "")).strip() or datetime.now(timezone.utc).isoformat()
            if not title:
                continue

            sanitized_items.append(
                {
                    "id": todo_id,
                    "title": title,
                    "completed": bool(item.get("completed", False)),
                    "createdAt": created_at,
                }
            )

        if sanitized_items:
            self._save_items(sanitized_items)


_controller = TodosController()


def handle(action_name: str, inputs: dict) -> dict:
    method = getattr(_controller, action_name, None)
    if method is None:
        return _fail(f"Unknown action: {action_name}")
    return method(inputs)
