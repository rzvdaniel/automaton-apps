# linkding for Automaton

This package runs [linkding](https://github.com/sissbruecker/linkding), a self-hosted bookmark manager by Sascha Ißbrücker. Upstream is licensed under the [MIT License](LICENSE.upstream.txt). The application itself comes from the unmodified upstream container image for version 1.47.0, pinned by digest in `automaton.json`; this repository contains only the Automaton contract and documentation.

The build command only checks that the package files exist. Studio currently requires a build command to deploy an image-backed app from stored catalog source; [automaton#799](https://github.com/rzvdaniel/automaton/issues/799) tracks removing that workaround.

The container serves HTTP on port 9090. Its SQLite database, secret key, favicons, previews and assets live in `AUTOMATON_APP_DATA_DIR/state`, which Automaton preserves across redeploys. The image's application files are copied into `AUTOMATON_APP_DATA_DIR/runtime-code` at startup because the Runner mounts the image read-only; this copy is replaced on each start while `state` remains intact. The process runs as user `1000:1000`, the same user as the Runner, so the Runner can remove the app's data. Background tasks are disabled in this one-container package, so features that depend on them may not run. **Sign in as `admin`** (the `LD_SUPERUSER_NAME` setting, default `admin`) with the `LD_SUPERUSER_PASSWORD` secret you gave during installation. Both are applied only when the database is first created. Change that password after signing in.

To verify an install, open the app, sign in, add a bookmark, redeploy, and confirm that the bookmark is still present. The upstream image and license are separate from Automaton's Apache-2.0 license.
