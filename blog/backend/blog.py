import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DATA_DIR = Path(os.environ["AUTOMATON_APP_DATA_DIR"])
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DB_DIR / "blog.sqlite3"
LEGACY_DB_PATH = DATA_DIR / "blog.sqlite3"
if LEGACY_DB_PATH.exists() and not DB_PATH.exists():
    LEGACY_DB_PATH.replace(DB_PATH)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    cleaned = []
    last_dash = False
    for char in value.lower().strip():
        if char.isalnum():
            cleaned.append(char)
            last_dash = False
        elif not last_dash:
            cleaned.append("-")
            last_dash = True
    return "".join(cleaned).strip("-") or secrets.token_hex(4)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          excerpt TEXT NOT NULL DEFAULT '',
          content_markdown TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
          author_name TEXT NOT NULL DEFAULT '',
          published_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    )


def ok(data: Any) -> dict:
    return {"success": True, "data": data, "error": ""}


def fail(message: str) -> dict:
    return {"success": False, "data": None, "error": message}


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), f"pbkdf2_sha256${salt}${digest}")


def hash_session_id(session_id: str) -> str:
    return hashlib.sha256(session_id.encode()).hexdigest()


def row_to_post(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "title": row["title"],
        "excerpt": row["excerpt"],
        "contentMarkdown": row["content_markdown"],
        "status": row["status"],
        "authorName": row["author_name"],
        "publishedAt": row["published_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


class BlogController:
    def _cleanup_expired_sessions(self, conn: sqlite3.Connection) -> None:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now(),))

    def setupStatus(self, inputs: dict) -> dict:
        print("setupStatus: checking blog setup state")
        with get_connection() as conn:
            self._cleanup_expired_sessions(conn)
            count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
            site_name = conn.execute("SELECT value FROM settings WHERE key = 'siteName'").fetchone()
            print(f"setupStatus: hasAdmin={count > 0}")
            return ok({"hasAdmin": count > 0, "siteName": site_name["value"] if site_name else "Automaton Blog", "tagline": "Built and hosted on Automaton"})

    def setup(self, inputs: dict) -> dict:
        site_name = str(inputs.get("siteName", "Automaton Blog")).strip() or "Automaton Blog"
        email = str(inputs.get("email", "")).strip().lower()
        password = str(inputs.get("password", ""))
        print(f"setup: starting setup for admin={email} siteName={site_name!r}")
        if "@" not in email:
            return fail("Enter a valid admin email.")
        if len(password) < 8:
            return fail("Password must be at least 8 characters.")
        with get_connection() as conn:
            self._cleanup_expired_sessions(conn)
            if conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0] > 0:
                print("setup: already completed")
                return fail("Setup has already been completed.")
            ts = now()
            cursor = conn.execute(
                "INSERT INTO users (email, password_hash, role, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?)",
                (email, hash_password(password), ts, ts),
            )
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('siteName', ?)", (site_name,))
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('tagline', 'Built and hosted on Automaton.')")
            session_id = self._create_session(conn, cursor.lastrowid)
            print(f"setup: admin created successfully user_id={cursor.lastrowid}")
            return ok({"sessionId": session_id})

    def login(self, inputs: dict) -> dict:
        email = str(inputs.get("email", "")).strip().lower()
        password = str(inputs.get("password", ""))
        print(f"login: attempting login for {email}")
        with get_connection() as conn:
            self._cleanup_expired_sessions(conn)
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if not user or not verify_password(password, user["password_hash"]):
                print(f"login: invalid credentials for {email}")
                return fail("Invalid email or password.")
            print(f"login: successful login for user_id={user['id']}")
            return ok({"sessionId": self._create_session(conn, user["id"])})

    def logout(self, inputs: dict) -> dict:
        session_id = str(inputs.get("sessionId", ""))
        print("logout: ending session")
        with get_connection() as conn:
            self._cleanup_expired_sessions(conn)
            if session_id:
                conn.execute("DELETE FROM sessions WHERE id = ?", (hash_session_id(session_id),))
        return ok({"loggedOut": True})

    def listPublishedPosts(self, inputs: dict) -> dict:
        print("listPublishedPosts: loading published posts")
        with get_connection() as conn:
            rows = conn.execute("SELECT * FROM posts WHERE status = 'published' ORDER BY COALESCE(published_at, created_at) DESC").fetchall()
            print(f"listPublishedPosts: returned {len(rows)} posts")
            return ok({"posts": [row_to_post(row) for row in rows]})

    def getPublishedPost(self, inputs: dict) -> dict:
        slug = str(inputs.get("slug", ""))
        print(f"getPublishedPost: loading slug={slug}")
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM posts WHERE slug = ? AND status = 'published'", (slug,)).fetchone()
            if not row:
                print(f"getPublishedPost: post not found for slug={slug}")
                return fail("Post not found.")
            return ok({"post": row_to_post(row)})

    def listAdminPosts(self, inputs: dict) -> dict:
        print("listAdminPosts: loading admin posts")
        auth = self._require_auth(inputs)
        if auth:
            return auth
        with get_connection() as conn:
            rows = conn.execute("SELECT * FROM posts ORDER BY updated_at DESC").fetchall()
            print(f"listAdminPosts: returned {len(rows)} posts")
            return ok({"posts": [row_to_post(row) for row in rows]})

    def getAdminPost(self, inputs: dict) -> dict:
        print(f"getAdminPost: loading id={inputs.get('id')}")
        auth = self._require_auth(inputs)
        if auth:
            return auth
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM posts WHERE id = ?", (inputs.get("id"),)).fetchone()
            if not row:
                return fail("Post not found.")
            return ok({"post": row_to_post(row)})

    def createPost(self, inputs: dict) -> dict:
        print(f"createPost: title={str(inputs.get('title', '')).strip()!r}")
        auth = self._require_auth(inputs)
        if auth:
            return auth
        return self._save_post(inputs, None)

    def updatePost(self, inputs: dict) -> dict:
        print(f"updatePost: id={inputs.get('id')} title={str(inputs.get('title', '')).strip()!r}")
        auth = self._require_auth(inputs)
        if auth:
            return auth
        return self._save_post(inputs, int(inputs.get("id") or 0))

    def deletePost(self, inputs: dict) -> dict:
        print(f"deletePost: id={inputs.get('id')}")
        auth = self._require_auth(inputs)
        if auth:
            return auth
        with get_connection() as conn:
            conn.execute("DELETE FROM posts WHERE id = ?", (inputs.get("id"),))
        print(f"deletePost: deleted id={inputs.get('id')}")
        return ok({"deleted": True})

    def _save_post(self, inputs: dict, post_id: int | None) -> dict:
        title = str(inputs.get("title", "")).strip()
        print(f"_save_post: post_id={post_id} requested_status={inputs.get('status', 'draft')}")
        content = str(inputs.get("contentMarkdown", "")).strip()
        if not title:
            print("_save_post: validation failed because title is missing")
            return fail("Title is required.")
        if not content:
            print("_save_post: validation failed because content is missing")
            return fail("Content is required.")
        status = str(inputs.get("status", "draft"))
        if status not in {"draft", "published"}:
            status = "draft"
        ts = now()
        slug = slugify(str(inputs.get("slug", "")).strip() or title)
        excerpt = str(inputs.get("excerpt", "")).strip() or content[:180]
        author = str(inputs.get("authorName", "")).strip() or "Automaton Team"
        with get_connection() as conn:
            if post_id:
                current = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
                if not current:
                    print(f"_save_post: post not found for id={post_id}")
                    return fail("Post not found.")
                published_at = current["published_at"] or (ts if status == "published" else None)
                conn.execute(
                    """
                    UPDATE posts SET slug = ?, title = ?, excerpt = ?, content_markdown = ?, status = ?,
                      author_name = ?, published_at = ?, updated_at = ? WHERE id = ?
                    """,
                    (slug, title, excerpt, content, status, author, published_at, ts, post_id),
                )
            else:
                published_at = ts if status == "published" else None
                cursor = conn.execute(
                    """
                    INSERT INTO posts (slug, title, excerpt, content_markdown, status, author_name, published_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (slug, title, excerpt, content, status, author, published_at, ts, ts),
                )
                post_id = cursor.lastrowid
            row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
            print(f"_save_post: saved post id={post_id} status={row['status']}")
            return ok({"post": row_to_post(row)})

    def _create_session(self, conn: sqlite3.Connection, user_id: int) -> str:
        session_id = secrets.token_urlsafe(32)
        ts = now()
        expires = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        conn.execute(
            "INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
            (hash_session_id(session_id), user_id, expires, ts, ts),
        )
        return session_id

    def _require_auth(self, inputs: dict) -> dict | None:
        session_id = str(inputs.get("sessionId", ""))
        if not session_id:
            print("_require_auth: missing session")
            return fail("Authentication required.")
        with get_connection() as conn:
            self._cleanup_expired_sessions(conn)
            session_hash = hash_session_id(session_id)
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_hash,)).fetchone()
            if not row or row["expires_at"] <= now():
                print("_require_auth: expired or missing session")
                return fail("Authentication required.")
            conn.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (now(), session_hash))
            return None


_controller = BlogController()


def handle(action_name: str, inputs: dict) -> dict:
    print(f"handle: action={action_name}")
    method = getattr(_controller, action_name, None)
    if method is None or action_name.startswith("_"):
        return fail(f"Unknown action: {action_name}")
    try:
        return method(inputs or {})
    except sqlite3.IntegrityError as exc:
        print(f"handle: integrity error for action={action_name}: {exc}")
        if "posts.slug" in str(exc):
            return fail("That slug is already in use.")
        if "users.email" in str(exc):
            return fail("That email is already in use.")
        return fail("Database constraint failed.")
    except Exception as exc:
        print(f"handle: unhandled error for action={action_name}: {exc}")
        return fail(str(exc))
