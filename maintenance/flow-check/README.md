# Flow check

Reads GitHub and says whether an issue really went through the delivery flow. Per issue it reports:

- **review**: the PR has a formal review whose commit is the PR's final commit (the PR author's login is noted, since agents share the owner's login);
- **tests**: the PR diff contains test files;
- **ci**: checks passed on the merge commit;
- **proof**: the issue has a `proof` artifact; it names the release and says whether the check was end to end or unit tests only;
- **production**: the production `/health` version contains the merge commit (the release tag `server-v<version>` is compared with the merge commit).

Each is `pass`, `warn`, `fail` or `unknown` (with the reason). Exit code 1 if any check fails.

## Run

```sh
python3 actions/check-flow/main.py --issue 680        # plain Python
automaton action run check-flow --input '{"issue":680}'
```

Without input it checks issues closed in the last 7 days plus open `verified` ones.

## Settings and secret

`REPO` (default `rzvdaniel/automaton`), `PRODUCTION_API_URL`. Secret `GITHUB_TOKEN` is optional: **without it the app is read-only** (public data only, 60 requests an hour, issue proof artifacts cannot be read so `proof` is `unknown`, nothing is posted). With a token (Issues read/write, Pull requests read) the nightly run adds the `flow-gap` label and one comment per issue when a check fails, and removes the label when the gaps are gone. It changes no other label.

The manifest offers a nightly schedule (03:00 UTC).

## Tests

```sh
python3 -m unittest discover -s actions/check-flow -p 'test_*.py'
```
