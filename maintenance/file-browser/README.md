# File Browser for Automaton

Upload, download and look at files in a storage folder on your server from the browser, like a hosting panel's file manager. This package runs [File Browser](https://github.com/filebrowser/filebrowser), licensed [Apache-2.0](LICENSE.upstream.txt). The build downloads the official, unmodified v2.63.23 release binary for the Runner's CPU (amd64 or arm64) and checks its SHA-256 (`build.sh`).

**Upstream is archived.** The File Browser project was archived on 2026-09-01: no more releases, bug fixes or security fixes. Install it private, give it only to administrators, and look for a maintained alternative when one appears.

Open the app (Open app goes to **Files**). Its root folder is `files/` in the app's data volume (`AUTOMATON_APP_DATA_DIR/files`), so uploaded files survive restarts and updates. It cannot see other apps' folders or the host filesystem.

## Sign-in

Inside Automaton, Automaton's own sign-in is in front and File Browser's login is off, so there is no second login. Everyone who may open the app is a File Browser administrator: install it as private and do not make it public.

## Run it on its own

```yaml
services:
  file-browser:
    image: debian:12.13-slim
    user: "1000:1000"
    working_dir: /app
    command: ["sh", "run.sh"]   # after `sh build.sh`, run from the generated dist/ folder
    ports: ["8080:8080"]
    environment:
      FB_ADMIN_PASSWORD: "change-me-to-12+-characters"
    volumes:
      - ./dist:/app:ro
      - file-browser-data:/data
volumes:
  file-browser-data:
```

| Variable | Meaning |
| --- | --- |
| `FB_ADMIN_PASSWORD` | Password of the user `admin`, at least 12 characters. Required on its own; the app refuses to start without it. Ignored inside Automaton. |
| `AUTOMATON_APP_DATA_DIR` | Data volume (set to `/data` above); holds `filebrowser.db` and `files/`. Default `data`. |
| `AUTOMATON_PORT` | Port to listen on. Default `8080`. |

Standalone, File Browser keeps its own login. Never run it without `FB_ADMIN_PASSWORD`; the app trusts Automaton's sign-in only when `AUTOMATON_API_URL` is set.
