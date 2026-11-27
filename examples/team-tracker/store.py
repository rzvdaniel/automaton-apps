"""Items and comments of the team tracker, kept in one JSON file under the app's data directory."""
import json, os, tempfile, threading, time, uuid
from datetime import date

STATUSES = ["New", "In progress", "Done"]
PRIORITIES = ["Low", "Medium", "High"]
MAX_ITEMS = 2000
MAX_COMMENTS = 200


class Invalid(ValueError):
    pass


def now() -> int:
    return int(time.time())


def clean(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


class Store:
    def __init__(self, directory: str):
        os.makedirs(directory, exist_ok=True)
        self.path = os.path.join(directory, "tracker.json")
        self.lock = threading.Lock()
        try:
            with open(self.path, encoding="utf-8") as f:
                self.items = json.load(f)["items"]
        except (OSError, ValueError, KeyError):
            self.items = []

    def _save(self):
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path))
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"items": self.items}, f)
        os.replace(tmp, self.path)

    def list(self) -> list:
        with self.lock:
            return json.loads(json.dumps(self.items))

    def _find(self, item_id: str) -> dict:
        for item in self.items:
            if item["id"] == item_id:
                return item
        raise Invalid("That request no longer exists.")

    def _fields(self, form: dict) -> dict:
        title = clean(form.get("title"), 200)
        if not title:
            raise Invalid("A request needs a title.")
        status = clean(form.get("status"), 20) or STATUSES[0]
        priority = clean(form.get("priority"), 20) or PRIORITIES[1]
        if status not in STATUSES or priority not in PRIORITIES:
            raise Invalid("Unknown status or priority.")
        due = clean(form.get("due"), 10)
        if due:
            try:
                date.fromisoformat(due)
            except ValueError:
                raise Invalid("The due date must look like 2026-12-31.")
        return {"title": title, "status": status, "priority": priority, "owner": clean(form.get("owner"), 80), "due": due,
                "description": str(form.get("description") or "").strip()[:2000]}

    def add(self, form: dict, author: str) -> str:
        fields = self._fields(form)
        with self.lock:
            if len(self.items) >= MAX_ITEMS:
                raise Invalid(f"At most {MAX_ITEMS} requests are supported.")
            item = {"id": uuid.uuid4().hex[:10], **fields, "creator": author, "created": now(), "updated": now(), "comments": []}
            self.items.append(item)
            self._save()
            return item["id"]

    def edit(self, item_id: str, form: dict):
        fields = self._fields(form)
        with self.lock:
            item = self._find(item_id)
            item.update(fields, updated=now())
            self._save()

    def move(self, item_id: str, status: str):
        if status not in STATUSES:
            raise Invalid("Unknown status.")
        with self.lock:
            item = self._find(item_id)
            item.update(status=status, updated=now())
            self._save()

    def comment(self, item_id: str, author: str, text: str):
        text = str(text or "").strip()[:2000]
        if not text:
            raise Invalid("A comment cannot be empty.")
        with self.lock:
            item = self._find(item_id)
            if len(item["comments"]) >= MAX_COMMENTS:
                raise Invalid("This request has too many comments.")
            item["comments"].append({"author": author or "Someone", "text": text, "at": now()})
            item["updated"] = now()
            self._save()

    def remove(self, item_id: str):
        with self.lock:
            self._find(item_id)
            self.items = [i for i in self.items if i["id"] != item_id]
            self._save()
