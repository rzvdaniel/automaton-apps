import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Cookie, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

app = FastAPI()
DATA_DIR = Path(os.environ.get("AUTOMATON_APP_DATA_DIR", ".automaton-data"))
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "blog.sqlite3"
LEGACY_DB_PATH = DATA_DIR / "blog.sqlite3"
if LEGACY_DB_PATH.exists() and not DB_PATH.exists():
    LEGACY_DB_PATH.replace(DB_PATH)

def now() -> str: return datetime.now(timezone.utc).isoformat()
def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    return f"pbkdf2_sha256${salt}${hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 260000).hex()}"
def verify_password(password: str, stored: str) -> bool:
    try: _, salt, digest = stored.split("$", 2)
    except ValueError: return False
    return hmac.compare_digest(hash_password(password, salt), f"pbkdf2_sha256${salt}${digest}")
def hash_session_id(value: str) -> str: return hashlib.sha256(value.encode()).hexdigest()
def slugify(value: str) -> str:
    out, dash = [], False
    for char in value.lower().strip():
        if char.isalnum(): out.append(char); dash = False
        elif not dash: out.append("-"); dash = True
    return "".join(out).strip("-") or secrets.token_hex(4)

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content_markdown TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('draft', 'published')), author_name TEXT NOT NULL DEFAULT '', published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    """)
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now(),))
    return conn
def post(row):
    return {"id": row["id"], "slug": row["slug"], "title": row["title"], "excerpt": row["excerpt"], "contentMarkdown": row["content_markdown"], "status": row["status"], "authorName": row["author_name"], "publishedAt": row["published_at"], "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
class Payload(BaseModel):
    model_config = {"extra": "allow"}
    siteName: str = "Automaton Blog"
    email: str = ""
    password: str = ""
    sessionId: str = ""
    slug: str = ""
    title: str = ""
    excerpt: str = ""
    contentMarkdown: str = ""
    status: str = "draft"
    authorName: str = ""
    id: int | None = None
def session_value(payload: Payload, cookie: str | None, header: str | None) -> str: return header or cookie or payload.sessionId
def require_auth(payload: Payload, cookie: str | None, header: str | None):
    value = session_value(payload, cookie, header)
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ? AND expires_at > ?", (hash_session_id(value), now())).fetchone()
        if not row: raise HTTPException(401, "Authentication required.")
        conn.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (now(), row["id"]))
def create_session(conn, user_id):
    value = secrets.token_urlsafe(32); ts = now(); expiry = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    conn.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)", (hash_session_id(value), user_id, expiry, ts, ts)); return value
def result(data: Any): return data

@app.get("/api/health")
def health(): return {"status": "ok"}
@app.get("/api/setup/status")
def setup_status():
    with get_connection() as c:
        admin = c.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0] > 0
        site = c.execute("SELECT value FROM settings WHERE key='siteName'").fetchone()
    return {"hasAdmin": admin, "siteName": site["value"] if site else "Automaton Blog", "tagline": "Built and hosted on Automaton"}
@app.post("/api/setup")
def setup(p: Payload, response: Response):
    email, password = p.email.strip().lower(), p.password
    if "@" not in email: raise HTTPException(400, "Enter a valid admin email.")
    if len(password) < 8: raise HTTPException(400, "Password must be at least 8 characters.")
    with get_connection() as c:
        if c.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0]: raise HTTPException(409, "Setup has already been completed.")
        ts = now(); cur = c.execute("INSERT INTO users(email,password_hash,created_at,updated_at) VALUES(?,?,?,?)", (email, hash_password(password), ts, ts)); c.execute("INSERT OR REPLACE INTO settings VALUES('siteName',?)", (p.siteName.strip() or "Automaton Blog",)); sid = create_session(c, cur.lastrowid)
    response.set_cookie("blog_session", sid, max_age=1209600, httponly=True, samesite="lax", path="/"); return {"sessionId": sid}
@app.post("/api/auth/login")
def login(p: Payload, response: Response):
    with get_connection() as c: user = c.execute("SELECT * FROM users WHERE email=?", (p.email.strip().lower(),)).fetchone(); sid = create_session(c, user["id"]) if user and verify_password(p.password, user["password_hash"]) else None
    if not sid: raise HTTPException(401, "Invalid email or password.")
    response.set_cookie("blog_session", sid, max_age=1209600, httponly=True, samesite="lax", path="/"); return {"sessionId": sid}
@app.post("/api/auth/logout")
def logout(p: Payload, response: Response, blog_session: str | None = Cookie(None), x_session_id: str | None = Header(None)):
    sid = session_value(p, blog_session, x_session_id)
    with get_connection() as c: c.execute("DELETE FROM sessions WHERE id=?", (hash_session_id(sid),))
    response.delete_cookie("blog_session", path="/"); return {"loggedOut": True}
@app.get("/api/posts")
def published():
    with get_connection() as c: rows = c.execute("SELECT * FROM posts WHERE status='published' ORDER BY COALESCE(published_at,created_at) DESC").fetchall()
    return {"posts": [post(r) for r in rows]}
@app.get("/api/posts/{slug}")
def published_one(slug: str):
    with get_connection() as c: row = c.execute("SELECT * FROM posts WHERE slug=? AND status='published'", (slug,)).fetchone()
    if not row: raise HTTPException(404, "Post not found.")
    return {"post": post(row)}
@app.get("/api/admin/posts")
def admin_list(p: Payload = Payload(), blog_session: str | None = Cookie(None), x_session_id: str | None = Header(None)):
    require_auth(p, blog_session, x_session_id)
    with get_connection() as c: rows = c.execute("SELECT * FROM posts ORDER BY updated_at DESC").fetchall()
    return {"posts": [post(r) for r in rows]}
@app.get("/api/admin/posts/{post_id}")
def admin_get(post_id: int, p: Payload = Payload(), blog_session: str | None = Cookie(None), x_session_id: str | None = Header(None)):
    require_auth(p, blog_session, x_session_id)
    with get_connection() as c: row = c.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    if not row: raise HTTPException(404, "Post not found.")
    return {"post": post(row)}
def save(p: Payload, post_id: int | None, cookie, header):
    require_auth(p, cookie, header); title, content = p.title.strip(), p.contentMarkdown.strip()
    if not title: raise HTTPException(400, "Title is required.")
    if not content: raise HTTPException(400, "Content is required.")
    ts, status = now(), p.status if p.status in {"draft", "published"} else "draft"; slug = slugify(p.slug.strip() or title); excerpt = p.excerpt.strip() or content[:180]; author = p.authorName.strip() or "Automaton Team"
    with get_connection() as c:
        current = c.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone() if post_id else None
        if post_id and not current: raise HTTPException(404, "Post not found.")
        published_at = (current["published_at"] if current else None) or (ts if status == "published" else None)
        if post_id: c.execute("UPDATE posts SET slug=?,title=?,excerpt=?,content_markdown=?,status=?,author_name=?,published_at=?,updated_at=? WHERE id=?", (slug,title,excerpt,content,status,author,published_at,ts,post_id))
        else: post_id = c.execute("INSERT INTO posts(slug,title,excerpt,content_markdown,status,author_name,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", (slug,title,excerpt,content,status,author,published_at,ts,ts)).lastrowid
        row = c.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    return {"post": post(row)}
@app.post("/api/admin/posts")
def create(p: Payload, blog_session: str | None = Cookie(None), x_session_id: str | None = Header(None)): return save(p, None, blog_session, x_session_id)
@app.put("/api/admin/posts/{post_id}")
def update(post_id: int, p: Payload, blog_session: str | None = Cookie(None), x_session_id: str | None = Header(None)): return save(p, post_id, blog_session, x_session_id)
@app.delete("/api/admin/posts/{post_id}")
def delete(post_id: int, p: Payload = Payload(), blog_session: str | None = Cookie(None), x_session_id: str | None = Header(None)):
    require_auth(p, blog_session, x_session_id)
    with get_connection() as c: c.execute("DELETE FROM posts WHERE id=?", (post_id,))
    return {"deleted": True}
