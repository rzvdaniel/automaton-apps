# Automaton Sentinel

Automaton Sentinel is a private, read-only server monitoring dashboard for an Automaton **Privileged Host Runner**. It samples fixed host files beneath `/host` and the Docker API at `/var/run/docker.sock` every three seconds, retaining about 15 minutes (300 points) in memory.

## Metrics

- Aggregate CPU use and 1/5/15-minute load averages
- Memory and swap capacity and use
- Disk capacity for physical filesystems
- Aggregate network receive/transmit counters and rates
- Uptime, OS, kernel, architecture, hostname, and CPU model
- Sanitized Docker container state, health, CPU, memory, and restart counts

Collectors fail independently. When the app runs without privileged mounts or Docker access, available panels continue working and the dashboard reports a degraded or unavailable source without exposing raw errors.

## API

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/history`

All routes are read-only and accept no paths, commands, Docker IDs, or other host selectors.

## Development

```text
cd backend
python -m pip install -r requirements-test.txt
python -m pytest -q tests

cd ../frontend
npm install
npm test
npm run typecheck
npm run build

cd ..
automaton validate
```

The frontend dev server proxies `/api` to `http://127.0.0.1:8765`; start the backend with `python -m uvicorn main:app --port 8765`.

## Deployment

1. Create or select a trusted Runner with the `PrivilegedHost` application profile.
2. Assign only this trusted app to that Runner; do not share it with unrelated or untrusted apps.
3. Keep runtime visibility private.
4. Run `automaton deploy --runner <runner-id-or-name>` and confirm `automaton status` reports the backend running.
5. Verify `/api/health`, all metric panels, Docker-unavailable behavior, and Privacy mode from the private app URL.

Do not target an Infrastructure Runner. Standard Runners are supported only as a safe degraded mode.

See [PUBLICATION.md](./PUBLICATION.md) for the intended future catalog settings. Publishing is deliberately outside this workflow.
