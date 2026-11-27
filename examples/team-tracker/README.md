# Team Tracker

An example app: a request and project tracker for a small team, built from a one-paragraph description to show what an AI-built replacement for a per-seat tool looks like (rzvdaniel/automaton#1806). **It is not in the catalog.**

Items have a title, status (New, In progress, Done), priority, owner, due date, details and comments. A board and a table view; filter by owner and status; move an item between statuses, edit or delete it. Changes show for everyone after a reload.

## Run it on its own

```yaml
services:
  team-tracker:
    image: python:3.12-slim
    working_dir: /app
    command: python main.py
    volumes:
      - ./examples/team-tracker:/app:ro
      - tracker-data:/data
    environment:
      AUTOMATON_APP_DATA_DIR: /data
      ADMIN_TOKEN: change-me-to-at-least-16-characters
    ports: ["8080:8080"]
volumes:
  tracker-data:
```

(Copy `ui/app.css`, `ui/app.js`, `ui/tracker.css` and `ui/tracker.js` as they are; the folder already has them.)

| Variable | Meaning |
|---|---|
| `AUTOMATON_APP_DATA_DIR` | Where `tracker.json` is kept (default `data`). The volume to keep. |
| `AUTOMATON_PORT` | Port to listen on (default 8080). |
| `ADMIN_TOKEN` | Outside Automaton, anyone can read the page but changing anything needs this token (at least 16 characters, a wrong try waits half a second). Unset or shorter: nothing can be changed. |
| `AUTOMATON_APP_ID` | Set by Automaton only. Never set it yourself: it makes the app trust the sign-in headers. |

## Inside Automaton

Automaton's own sign-in is in front: the server's users are the team. The app trusts the `X-Automaton-Viewer-*` headers only when Automaton runs it. Writing needs a signed-in viewer; the author of a comment is `X-Automaton-Viewer-Name` when the server sends it, otherwise the name the person types (remembered in the browser; a label, not a proof).

## Tests

`sh test.sh`
