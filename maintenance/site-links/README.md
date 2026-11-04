# Site links

An unpublished maintenance app that crawls the public Automaton website, docs, store, and the Studio sign-in page (pages behind sign-in are not checked). It opens or updates one GitHub issue per configured site when links fail, and closes the issue when a later run finds no problems.

## Setup

1. Deploy this app to the TEST server and run it on an assigned Runner.
2. Set `GITHUB_TOKEN` with `automaton secrets set`. Use a fine-grained token with Issues read/write on `rzvdaniel/automaton` only.
3. In Studio, schedule the `check-links` Action nightly at 02:00 server time with empty JSON input. App manifests cannot declare schedules yet, so this step is needed after every fresh deploy.
4. Review `actions/check-links/sites.json` for crawl roots and add known flaky URLs to `actions/check-links/ignore.json`.
5. The crawler follows same-host links up to 2,000 pages per site and sends at most four requests per second. External links use HEAD and fall back to GET; two failed checks mark a link broken. If one site or the GitHub API fails, the other sites are still checked and the run exits with 1.

Each issue has a hidden `site-links:<key>` marker and the `maintenance` label. External URLs are cached across all sites for one run. Requests to non-public IP addresses are not made. The GitHub token is sent only to the GitHub API, never to crawled links.

## Tests

```sh
python3 -m unittest discover -s actions/check-links -p 'test_*.py'
```
