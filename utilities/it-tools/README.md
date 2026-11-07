# IT-Tools

[IT-Tools](https://github.com/CorentinTh/it-tools) by Corentin Thomasset: handy online tools for developers (converters, encoders, generators, formatters). It is a static site that runs entirely in the browser, so nothing you type is sent to the server.

- **Upstream:** https://github.com/CorentinTh/it-tools
- **License:** GPL-3.0. The upstream license text is in [LICENSE](LICENSE) and is copied into the site as `LICENSE.txt`. Upstream source is not modified.
- **Packaged version:** `2024.10.22-7ca5933` (release `v2024.10.22-7ca5933`).
- **Configuration:** none. There are no settings, secrets or data.

## How it is sourced (approach B, pinned upstream release)

`build.sh` runs on the Runner at deploy time. It downloads that one release archive from GitHub, checks its SHA-256 against the value pinned in the script, and publishes the site from it. It uses the release archive that upstream's own workflow built, not a compile on your Runner: compiling IT-Tools with `vite build` needs more than 3 GB of memory and was killed on a 2 vCPU / 4 GB Runner. To update, change `VERSION` and `SHA256` in `build.sh` and the version here.

## Install

Install it from **Apps → Catalog** on your Automaton server, or from Studio's **Install from a Git address** with this folder's address.
