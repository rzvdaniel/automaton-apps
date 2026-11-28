"""Daily report generation and email delivery for Release Keeper."""

import json
import os
import urllib.request
from datetime import datetime, timezone
from store import Store, utc_now_iso


def _send_automaton_email(subject: str, body: str, to: str = "owner", poster=None) -> tuple[bool, str]:
    api_url = os.environ.get("AUTOMATON_API_URL", "").rstrip("/")
    app_token = os.environ.get("AUTOMATON_APP_TOKEN", "")
    if not api_url or not app_token:
        return False, "Not running under Automaton (email skipped)"

    url = f"{api_url}/api/apps/notify/email"
    payload = {"to": to, "subject": subject, "body": body}
    if poster is not None:
        poster(url, payload, headers={"Authorization": f"Bearer {app_token}"})
        return True, ""

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {app_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if 200 <= resp.status < 300:
                return True, ""
            return False, f"HTTP {resp.status}"
    except Exception as exc:
        return False, str(exc)


def generate_daily_report(store: Store, kind: str = "morning", send_email: bool = True, poster=None) -> dict:
    kind_norm = "eod" if kind in ("eod", "end_of_day", "evening") else "morning"
    now_dt = datetime.now(timezone.utc)
    date_str = now_dt.strftime("%Y-%m-%d")
    report_id = f"{date_str}-{kind_norm}"

    prod_ver = store.get_meta("prod_version", "unknown")
    test_ver = store.get_meta("test_version", "unknown")
    pipeline = store.get_meta_json("pipeline", {"Inbox": 0, "Ready": 0, "In progress": 0, "Verify": 0, "Done": 0})
    needs_you = store.get_meta_json("needs_you", [])
    releases = store.list_releases(limit=5, offset=0)
    ready_count = releases["counts"].get("ready", 0)
    lessons = store.list_lessons(f="open", limit=5, offset=0)
    open_lessons = lessons["counts"].get("open", 0)

    kind_label = "Morning" if kind_norm == "morning" else "End of day"
    headline = f"{kind_label}: prod {prod_ver}, test {test_ver}, {ready_count} ready, {open_lessons} open lessons"

    sections = [
        {
            "title": "Servers",
            "items": [
                f"Production: {prod_ver}",
                f"Test (runner-01): {test_ver}",
                f"Ready to deploy: {ready_count}",
            ],
        },
        {
            "title": "Pipeline (Board 17)",
            "items": [f"{k}: {v}" for k, v in pipeline.items()],
        },
        {
            "title": f"Needs you ({len(needs_you)})",
            "items": [n.get("title", "") for n in needs_you] or ["Nothing waiting"],
        },
        {
            "title": f"Open lessons ({open_lessons})",
            "items": [f"{l['id']} {l['title']} ({l['area']})" for l in lessons["items"]] or ["No open lessons"],
        },
    ]

    lines = [f"# Release Keeper — {kind_label} ({date_str})", ""]
    for sec in sections:
        lines.append(f"## {sec['title']}")
        for item in sec["items"]:
            lines.append(f"- {item}")
        lines.append("")
    body_md = "\n".join(lines)

    emailed_at = ""
    state = "saved"
    if send_email:
        to = os.environ.get("EMAIL_TO", "owner")
        ok, _ = _send_automaton_email(f"[Release Keeper] {headline}", body_md, to=to, poster=poster)
        if ok:
            emailed_at = utc_now_iso()
            state = "sent"

    rep = {
        "id": report_id,
        "created_at": utc_now_iso(),
        "kind": kind_norm,
        "headline": headline,
        "needs_you_count": len(needs_you),
        "state": state,
        "body_md": body_md,
        "sections": sections,
        "emailed_at": emailed_at,
    }
    store.upsert_report(rep)
    return rep
