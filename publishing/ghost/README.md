# Ghost

[Ghost](https://github.com/TryGhost/Ghost): a publishing platform for blogs and newsletters.

- **Upstream:** https://github.com/TryGhost/Ghost
- **License:** MIT ([LICENSE.upstream.txt](LICENSE.upstream.txt)). Upstream is not modified.
- **Packaged version:** `6.77.0`, the upstream `ghost:6-alpine` image pinned by digest in `automaton.json`.

## One container, SQLite

Ghost recommends MySQL for production, but an Automaton app is one container, so this package runs Ghost on its SQLite database. Posts, images, themes and the database live in `AUTOMATON_APP_DATA_DIR/content` and survive restarts and updates. Back up the app's data directory to back up the blog. The image is read-only, so `run.sh` points Ghost's content path at the data directory and lets the image's own entrypoint copy the default themes there on first start.

## Configuration

- `GHOST_URL` (setting, required): the app's full address, for example `https://blog.example.com`. The platform does not tell an app its own address, so set it after install (the address exists only then) and restart. Ghost builds every link from it.
- Admin: open `<address>/ghost/` and create the administrator right after install: whoever opens it first becomes the owner.
- Email from Ghost itself (sign-in, notifications): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` settings, `SMTP_PASSWORD` secret and `MAIL_FROM`. All optional.
- Newsletters need Mailgun's API, not SMTP: `MAILGUN_API_KEY` (secret), `MAILGUN_DOMAIN` and `MAILGUN_REGION` (`EU` or `US`) settings. Until the key and domain are set, newsletters are off and the start-up log says so.

`proxy.js` starts Ghost on a private port and forwards the app port to it with `X-Forwarded-Proto: https`; without it Ghost answers every plain-http request (including Automaton's health check) with a redirect to its https address.
