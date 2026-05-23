from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_FILE = DATA_DIR / "todos.json"


def _ok(data: dict) -> dict:
    return {"success": True, "data": data, "error": ""}


def _fail(message: str) -> dict:
    return {"success": False, "data": None, "error": message}


class TodosController:
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
        if not DATA_FILE.exists():
            return []

        with DATA_FILE.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        if not isinstance(data, list):
            return []
        return data

    def _save_items(self, items: list[dict]) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with DATA_FILE.open("w", encoding="utf-8") as handle:
            json.dump(items, handle, indent=2)


_controller = TodosController()


def handle(action_name: str, inputs: dict) -> dict:
    method = getattr(_controller, action_name, None)
    if method is None:
        return _fail(f"Unknown action: {action_name}")
    return method(inputs)
