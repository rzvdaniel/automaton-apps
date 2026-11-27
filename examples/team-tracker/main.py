"""Team tracker: requests with status, priority, owner, due date and comments, as a board and a table."""
import hmac, os, sys, time
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from store import PRIORITIES, STATUSES, Invalid, Store

MIN_ADMIN_TOKEN = 16
ASSETS = ("/ui/app.css", "/ui/app.js", "/ui/tracker.css", "/ui/tracker.js")


class App:
    def __init__(self, env=os.environ):
        self.store = Store(env.get("AUTOMATON_APP_DATA_DIR", "data"))
        # The platform sets AUTOMATON_APP_ID for every app it runs; only then are its viewer headers to be trusted.
        self.managed = bool(env.get("AUTOMATON_APP_ID", "").strip())
        self.admin_token = env.get("ADMIN_TOKEN", "")


def signed_in(headers) -> bool:
    """The platform proxy sets both viewer headers for a signed-in user and replaces any the client sent."""
    return bool(headers.get("X-Automaton-Viewer-Role")) and bool(headers.get("X-Automaton-Viewer-Token"))


def may_write(app: App, headers, form: dict) -> bool:
    """Run by Automaton, its sign-in decides. Run anywhere else the viewer headers could be forged, so writing
    needs the ADMIN_TOKEN (Bearer header or form field); without a long enough one nothing can be written."""
    if app.managed:
        return signed_in(headers)
    supplied = form.get("admin_token", "")
    auth = headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        supplied = auth[7:]
    if len(app.admin_token) < MIN_ADMIN_TOKEN:
        return False
    if hmac.compare_digest(supplied.encode(), app.admin_token.encode()):
        return True
    time.sleep(0.5)  # slows guessing
    return False


def same_origin(headers) -> bool:
    origin = headers.get("Origin", "")
    hosts = {headers.get("Host", ""), headers.get("X-Forwarded-Host", "")} - {""}
    return bool(origin) and urlsplit(origin).netloc in hosts


def viewer_name(app: App, headers, form: dict) -> str:
    """Automaton may pass the viewer's name; otherwise the person types who they are (a label, not a proof)."""
    named = headers.get("X-Automaton-Viewer-Name") if app.managed else ""
    return " ".join((named or form.get("author") or "").split())[:80] or "Someone"


def ago(ts: int) -> str:
    return time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts)) + " UTC"


def link(view: str, owner: str, status: str, extra: dict | None = None) -> str:
    query = {k: v for k, v in {"view": view if view != "board" else "", "owner": owner, "status": status, **(extra or {})}.items() if v}
    return "./" + ("?" + urlencode(query) if query else "")


def options(values, selected: str, blank: str = "") -> str:
    head = f'<option value="">{escape(blank)}</option>' if blank else ""
    return head + "".join(f'<option{" selected" if v == selected else ""}>{escape(v)}</option>' for v in values)


def item_fields(item: dict | None, owners: list) -> str:
    item = item or {}
    return (f'<label class="a-field">Title<input class="a-input" name="title" required maxlength="200" value="{escape(item.get("title", ""), quote=True)}"></label>'
            f'<label class="a-field">Status<select class="a-input" name="status">{options(STATUSES, item.get("status", ""))}</select></label>'
            f'<label class="a-field">Priority<select class="a-input" name="priority">{options(PRIORITIES, item.get("priority", "Medium"))}</select></label>'
            f'<label class="a-field">Owner<input class="a-input" name="owner" list="owners" maxlength="80" value="{escape(item.get("owner", ""), quote=True)}"></label>'
            f'<label class="a-field">Due date<input class="a-input" name="due" type="date" value="{escape(item.get("due", ""), quote=True)}"></label>'
            f'<label class="a-field">Details (optional)<textarea class="a-input" name="description" rows="3" maxlength="2000">{escape(item.get("description", ""))}</textarea></label>')


def priority_pill(priority: str) -> str:
    return f'<span class="a-pill{" a-pill--warning" if priority == "High" else ""}">{escape(priority)}</span>'


def details(item: dict, ctx: dict) -> str:
    comments = "".join(f'<li><strong>{escape(c["author"])}</strong> <span class="a-hint">{ago(c["at"])}</span><br>{escape(c["text"])}</li>' for c in item["comments"]) or '<li class="a-hint">No comments yet.</li>'
    moves = "".join(f'<form method="post" action="items/move">{ctx["hidden"]}<input type="hidden" name="id" value="{item["id"]}"><input type="hidden" name="status" value="{s}">{ctx["token"]}<button class="a-btn" type="submit">{escape(s)}</button></form>'
                    for s in STATUSES if s != item["status"])
    return (f'<details class="t-item"><summary>{escape(item["title"])}</summary>'
            f'<p class="a-hint">{escape(item["description"])}</p>'
            f'<h3 class="t-sub">Comments</h3><ul class="t-comments">{comments}</ul>'
            f'<form class="a-form" method="post" action="items/comment">{ctx["hidden"]}<input type="hidden" name="id" value="{item["id"]}">{ctx["author"]}'
            f'<label class="a-field">Comment<textarea class="a-input" name="text" rows="2" required maxlength="2000"></textarea></label>{ctx["token"]}<div><button class="a-btn" type="submit">Add comment</button></div></form>'
            f'<h3 class="t-sub">Edit</h3><form class="a-form" method="post" action="items/edit">{ctx["hidden"]}<input type="hidden" name="id" value="{item["id"]}">{item_fields(item, ctx["owners"])}{ctx["token"]}'
            f'<div class="t-row"><button class="a-btn a-btn--primary" type="submit">Save</button></div></form>'
            f'<div class="t-row">Move to {moves}<form method="post" action="items/remove">{ctx["hidden"]}<input type="hidden" name="id" value="{item["id"]}">{ctx["token"]}<button class="a-btn a-btn--danger" type="submit">Delete</button></form></div></details>')


def card(item: dict, ctx: dict) -> str:
    meta = f'{escape(item["owner"] or "Unassigned")}' + (f' · due {escape(item["due"])}' if item["due"] else "") + (f' · ' + str(len(item["comments"])) + (' comment' if len(item["comments"]) == 1 else ' comments') if item["comments"] else "")
    return f'<article class="a-card t-card">{priority_pill(item["priority"])}<div class="a-hint">{meta}</div>{details(item, ctx)}</article>'


def board(items: list, ctx: dict) -> str:
    cols = []
    for status in STATUSES:
        mine = [i for i in items if i["status"] == status]
        body = "".join(card(i, ctx) for i in mine) or '<div class="a-empty">Nothing here</div>'
        cols.append(f'<section class="t-col"><h2 class="a-card__title">{escape(status)} <span class="a-pill">{len(mine)}</span></h2>{body}</section>')
    return f'<div class="t-board">{"".join(cols)}</div>'


def table(items: list, ctx: dict) -> str:
    if not items:
        return '<div class="a-empty">No requests match.</div>'
    rows = "".join(f'<tr><td>{details(i, ctx)}</td><td>{escape(i["status"])}</td><td>{priority_pill(i["priority"])}</td><td>{escape(i["owner"] or "Unassigned")}</td><td>{escape(i["due"])}</td><td class="a-num">{len(i["comments"])}</td></tr>' for i in items)
    return f'<div class="a-table-wrap"><table class="a-table"><thead><tr><th>Request</th><th>Status</th><th>Priority</th><th>Owner</th><th>Due</th><th class="a-num">Comments</th></tr></thead><tbody>{rows}</tbody></table></div>'


def render(app: App, query: dict, error: str = "", standalone: bool = False) -> str:
    view = "table" if query.get("view") == "table" else "board"
    owner, status = query.get("owner", ""), query.get("status", "")
    everything = app.store.list()
    owners = sorted({i["owner"] for i in everything if i["owner"]} | {c["author"] for i in everything for c in i["comments"]})
    shown = [i for i in everything if (not owner or i["owner"] == (owner if owner != "Unassigned" else "")) and (not status or i["status"] == status)]
    order = {p: n for n, p in enumerate(reversed(PRIORITIES))}
    shown.sort(key=lambda i: (order[i["priority"]], i["due"] or "9999", i["created"]))
    token = '<label class="a-field">Admin token<input class="a-input" name="admin_token" type="password" autocomplete="off" required></label>' if standalone else ""
    author = '<label class="a-field">Your name<input class="a-input" name="author" maxlength="80" data-remember="name"></label>'
    hidden = "".join(f'<input type="hidden" name="{k}" value="{escape(v, quote=True)}">' for k, v in (("view", view), ("f_owner", owner), ("f_status", status)) if v)
    ctx = {"owners": owners, "token": token, "author": author, "hidden": hidden}
    tabs = "".join(f'<a class="a-btn{" a-btn--primary" if v == view else ""}" href="{link(v, owner, status)}">{v.title()}</a>' for v in ("board", "table"))
    filters = (f'<form class="t-filters" method="get" action="./"><input type="hidden" name="view" value="{view}">'
               f'<label class="a-field">Owner<select class="a-input" name="owner">{options(["Unassigned"] + owners, owner, "Everyone")}</select></label>'
               f'<label class="a-field">Status<select class="a-input" name="status">{options(STATUSES, status, "Any")}</select></label>'
               f'<button class="a-btn" type="submit">Filter</button><a class="a-btn" href="{link(view, "", "")}">Clear</a></form>')
    problem = f'<p class="a-note a-note--critical" role="alert">{escape(error)}</p>' if error else ""
    new = (f'<details class="a-card"><summary class="a-card__title">New request</summary>{problem}<form class="a-form" method="post" action="items/add">{hidden}{item_fields(None, owners)}{author}{token}'
           f'<div><button class="a-btn a-btn--primary" type="submit">Create request</button></div></form></details>')
    body = board(shown, ctx) if view == "board" else table(shown, ctx)
    datalist = "<datalist id=\"owners\">" + "".join(f"<option value=\"{escape(o, quote=True)}\">" for o in owners) + "</datalist>"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Team tracker</title><link rel="stylesheet" href="ui/app.css"><link rel="stylesheet" href="ui/tracker.css"><script src="ui/app.js"></script></head>
<body><header class="a-header"><div class="a-page t-head"><div><h1 class="a-header__title">Team tracker</h1><p class="a-header__sub">{len(shown)} of {len(everything)} requests</p></div>
<div class="a-header__actions">{tabs}<button class="a-btn a-btn--icon" type="button" data-theme-toggle aria-label="Switch light or dark theme">&#9680;</button></div></div></header>
<main class="a-page a-stack">{new}{filters}{body}<p class="a-hint">Reload the page to see what others changed.</p></main>{datalist}<script src="ui/tracker.js"></script></body></html>"""


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parts = urlsplit(self.path)
            if parts.path == "/health":
                self.reply(200, "text/plain", b"ok")
            elif parts.path == "/":
                query = {k: v[0] for k, v in parse_qs(parts.query).items()}
                self.reply(200, "text/html; charset=utf-8", render(app, query, query.get("error", "")[:200], not app.managed).encode())
            elif parts.path in ASSETS:
                self.reply(200, "text/css" if parts.path.endswith(".css") else "text/javascript", (Path(__file__).parent / parts.path.lstrip("/")).read_bytes())
            else:
                self.reply(404, "text/plain", b"not found")

        def do_POST(self):
            action = urlsplit(self.path).path.removeprefix("/items/")
            if action not in ("add", "edit", "move", "comment", "remove") or not self.path.startswith("/items/"):
                return self.reply(404, "text/plain", b"not found")
            if app.managed and not signed_in(self.headers):
                return self.reply(401, "text/plain", b"sign in required")
            if not same_origin(self.headers):
                return self.reply(403, "text/plain", b"forbidden")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if not 0 <= length <= 16384:
                return self.reply(413, "text/plain", b"too large")
            form = {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode("utf-8", "replace"), keep_blank_values=True).items()}
            if not may_write(app, self.headers, form):
                return self.reply(401, "text/plain", b"sign in required" if app.managed else b"wrong or missing admin token (ADMIN_TOKEN needs 16 characters)")
            author = viewer_name(app, self.headers, form)
            try:
                item_id = form.get("id", "")
                if action == "add":
                    app.store.add(form, author)
                elif action == "edit":
                    app.store.edit(item_id, form)
                elif action == "move":
                    app.store.move(item_id, form.get("status", ""))
                elif action == "comment":
                    app.store.comment(item_id, author, form.get("text", ""))
                else:
                    app.store.remove(item_id)
                error = ""
            except Invalid as problem:
                error = str(problem)
            back = {"view": form.get("view", ""), "owner": form.get("f_owner", ""), "status": form.get("f_status", ""), "error": error}
            query = urlencode({k: v for k, v in back.items() if v})
            self.send_response(303)
            self.send_header("Location", "./" + ("?" + query if query else ""))
            self.send_header("Content-Length", "0")
            self.end_headers()

        def reply(self, code: int, kind: str, body: bytes):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass
    return Handler


def main() -> int:
    port = int(os.environ.get("AUTOMATON_PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(App())).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
