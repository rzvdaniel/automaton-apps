# Adminer for Automaton

Browse and edit a database from the browser, like phpMyAdmin in a hosting panel. This package runs [Adminer](https://www.adminer.org/) (supports PostgreSQL, MySQL/MariaDB, SQLite, MS SQL and more).

- **Upstream:** https://github.com/vrana/adminer
- **License:** Apache-2.0 or GPL-2.0 ([LICENSE.upstream.txt](LICENSE.upstream.txt)). Upstream is not modified.
- **Packaged version:** `5.5.1`, the upstream `adminer:5` image pinned by digest in `automaton.json`.

## Use it

Install it from Catalog → Maintenance and open it. Automaton's own sign-in is in front. Adminer then asks for the database system, host, user and password; type them there. Nothing is stored in the package or the app's settings.

**Install it private** and give it only to administrators: anyone who may open the page can try to connect to any database the app's container can reach. The package declares no public access, so the app page does not offer "Anyone on the internet"; do not add it.

It reaches databases its own container can reach (for example a PostgreSQL server on your network). Reaching the database inside another Automaton app is not part of this package.

Upstream's optional `ADMINER_PLUGINS` and `ADMINER_DESIGN` settings are not set up in this package.

## Run it on its own

```yaml
services:
  adminer:
    image: adminer:5.5.1
    ports: ["127.0.0.1:8080:8080"]
```

No environment variables or data volume are needed. Without Automaton there is no sign-in in front: keep the port on localhost or behind your own authentication.
