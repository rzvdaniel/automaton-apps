# linkding

[linkding](https://github.com/sissbruecker/linkding) by Sascha Ißbrücker: a self-hosted bookmark manager. Save, tag and search links, share them, and use the browser extension or the REST API.

- **Upstream:** https://github.com/sissbruecker/linkding
- **License:** MIT. The upstream license text is in [LICENSE](LICENSE). Upstream is not modified.
- **Packaged version:** `1.47.0` (image `sissbruecker/linkding:1.47.0`).

## Configuration

Asked when you install:

- `LD_SUPERUSER_NAME` (setting, default `admin`) and `LD_SUPERUSER_PASSWORD` (secret): the first administrator, created the first time the database is created. Changing them later does not change an existing account; use linkding's own account pages.
- `LD_CSRF_TRUSTED_ORIGINS` (setting, optional): the address you open linkding at, for example `https://app-<id>.apps.example.com` (comma separated for several). Automaton does not pass the public host to apps, so linkding needs it to accept its own sign-in form. Leave it empty at install (the address is not known yet), then set it in the app's settings and redeploy.

Other [linkding options](https://linkding.link/options/) can be set as app settings or secrets of the install.

Data (SQLite database, favicons, previews, secret key) is kept in the app data directory (`state/`), so it survives redeploys and restarts.

## Known limits on the platform (until fixed)

- Web forms do not work yet: Automaton drops the body of form posts to apps ([#802](https://github.com/rzvdaniel/automaton/issues/802)), so linkding's sign-in page cannot be used. The REST API (JSON) works: create an API token with `python manage.py shell` in the container, or use it once #802 is fixed through the web UI.
- Cookies set by one app are replayed to other apps on the same Runner ([#803](https://github.com/rzvdaniel/automaton/issues/803)).
- The container runs as uid 1000 (`runtime.user`) so the Runner (also uid 1000) can delete the app's data ([#804](https://github.com/rzvdaniel/automaton/issues/804)).
- The `build` entry is a no-op because Studio's install from a catalog or Git address refuses an image-only package ([#799](https://github.com/rzvdaniel/automaton/issues/799)); remove it when that is fixed.

## How it is sourced (approach A, upstream image)

`application.runtime.image` is the project's own published image, pinned to a version. Nothing is built: linkding needs two toolchains (Python with compiled extensions, and Node), a compiled SQLite ICU extension and system libraries (ICU, PCRE2) in its runtime image, which is too heavy to rebuild on a small Runner.

The image's `bootstrap.sh` starts uWSGI as `www-data`, changes file owners and writes into the image, which needs capabilities and a writable root filesystem that Automaton's containers do not have. The start command in `automaton.json` therefore copies the app code (not the Python environment) to the data directory, runs the same steps as `bootstrap.sh` itself (secret key, migrations, WAL mode, first administrator, task migration) and starts uWSGI from a copy of `uwsgi.ini` without its `uid` and `gid` lines. The background task worker (huey) runs next to uWSGI without a supervisor; if it stops, background tasks (favicons, previews) wait until the next start. To update, change the image tag and re-check that start command against the new `bootstrap.sh`.

## Install

Install it from **Apps → Catalog** on your Automaton server, or from Studio's **Install from a Git address** with this folder's address.
