# Release Keeper

Shows the current release, past releases with notes and verification, daily reports (Morning and End of day) and lessons learned, and emails the daily report to the owner.

## Run it on its own

```yaml
services:
  release-keeper:
    image: python:3.12-slim
    working_dir: /app
    command: python main.py
    ports:
      - "8080:8080"
    environment:
      RK_ADMIN_TOKEN: "replace-with-a-16-char-or-longer-token"
      RK_GH_TOKEN: "github_pat_read_only_repo_and_project"
      RK_REPOS: "rzvdaniel/automaton,rzvdaniel/automaton-apps"
      RK_BOARD_NUMBER: "17"
      RK_BOARD_OWNER: "rzvdaniel"
      RK_PROD_API_URL: "https://api.automaton.monster"
      RK_TEST_API_URL: "https://api.runner-01.automaton.monster"
      DATA_DIR: "/data"
    volumes:
      - ./:/app:ro
      - release_keeper_data:/data

volumes:
  release_keeper_data:
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `RK_ADMIN_TOKEN` | Admin token (at least 16 characters) required when running standalone | empty |
| `RK_GH_TOKEN` | Read-only GitHub token (`repo`, `project` scopes) | empty |
| `RK_REPOS` | Comma-separated GitHub repositories to track | `rzvdaniel/automaton,rzvdaniel/automaton-apps` |
| `RK_BOARD_NUMBER` | GitHub Project board number | `17` |
| `RK_BOARD_OWNER` | GitHub user or org owning the board | `rzvdaniel` |
| `RK_PROD_API_URL` | Production Automaton server API URL | `https://api.automaton.monster` |
| `RK_TEST_API_URL` | Test Automaton server API URL | `https://api.runner-01.automaton.monster` |
| `EMAIL_TO` | Recipient for daily report emails (under Automaton `notify:email`) | `owner` |
| `DATA_DIR` | Directory where `release_keeper.db` is stored | `data` |

### Data volume

SQLite database `release_keeper.db` is stored in `DATA_DIR` (`/data` in the compose example).
