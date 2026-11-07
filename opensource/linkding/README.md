# linkding for Automaton

This package runs [linkding](https://github.com/sissbruecker/linkding), a self-hosted bookmark manager by Sascha Ißbrücker. Upstream is licensed under the [MIT License](LICENSE.upstream.txt). The application itself comes from the unmodified upstream container image for version 1.47.0, pinned by digest in `automaton.json`; this repository contains only the Automaton contract and documentation.

The container serves HTTP on port 9090. Its SQLite database, secret key, favicons, previews and assets live in `AUTOMATON_APP_DATA_DIR`, which Automaton preserves across redeploys. Background tasks are disabled in this one-container package, so features that depend on them may not run. The initial administrator name defaults to `admin`; supply `LD_SUPERUSER_PASSWORD` as a secret during installation. Change that password after signing in.

To verify an install, open the app, sign in, add a bookmark, redeploy, and confirm that the bookmark is still present. The upstream image and license are separate from Automaton's Apache-2.0 license.
