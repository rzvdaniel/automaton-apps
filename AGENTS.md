# AGENTS.md

## Scope

This repository currently contains one active app project:

- `pac-man/` — browser-based Pac-Man editor and game

Unless the user says otherwise, work should be assumed to target `pac-man/`.

## Repository Layout

- `.github/workflows/pac-man-build.yml` builds the Pac-Man app and uploads the `dist` bundle as a GitHub artifact.
- `.github/workflows/pac-man-deploy.yml` is a future-facing GitHub deploy workflow for when Automaton is publicly reachable.
- `pac-man/automaton.json` contains the linked Automaton app id and current server URL.
- `pac-man/docs/pac-man-app.md` contains project-specific operational notes.

## Pac-Man Project Facts

- Tech stack: static frontend app using HTML, CSS, JavaScript, and Vite.
- Source files live directly under `pac-man/index.html`, `pac-man/js/`, `pac-man/css/`, and `pac-man/assets/`.
- Production output is generated into `pac-man/dist/`.
- Published mazes are stored under `pac-man/assets/levels/` and indexed by `pac-man/assets/levels/catalog.json`.
- The app has no Python backend and does not require an Automaton runner.

## Development Workflow

Run commands from `pac-man/` unless explicitly noted otherwise.

- Install dependencies: `npm install`
- Start local development: `npm run dev`
- Build production bundle: `npm run build`
- Preview production bundle: `npm run preview`

After changes that affect the shipped app, prefer validating the production bundle with `npm run build`.

## Deployment Policy

### Current deployment path

Use the local script-based deployment path for normal work.

- Primary deterministic deploy command: `npm run deploy:build`
- Upload-only command: `npm run deploy`
- Windows helper: `./scripts/deploy-local.ps1`

The local deploy script reads:

- `AUTOMATON_API_KEY` from `.env.local`, `.env`, or the shell environment
- `AUTOMATON_SERVER` and `AUTOMATON_APP_ID` from env vars if provided, otherwise from `automaton.json`

This local script path is the intended deterministic alternative to MCP-driven uploads.

### Current GitHub policy

- Keep GitHub build CI active.
- Keep GitHub deploy workflow present but treat it as inactive for day-to-day use.
- Do not rely on `.github/workflows/pac-man-deploy.yml` while Automaton is local-only at `http://localhost:5091`.

### Future deployment path

When Automaton becomes publicly reachable, `.github/workflows/pac-man-deploy.yml` becomes the intended GitHub-based deployment path.

It expects these GitHub repository secrets:

- `AUTOMATON_SERVER`
- `AUTOMATON_APP_ID`
- `AUTOMATON_API_KEY`

## Agent Guidance

- Prefer minimal, focused changes inside `pac-man/`.
- Preserve the current local-first deployment model unless the user explicitly asks to change it.
- If deployment behavior changes, update both `pac-man/docs/pac-man-app.md` and this file.
- If changing the shipped frontend, avoid editing `dist/` manually; rebuild it from source.
- If asked to deploy now, prefer the local script path or MCP upload, not the GitHub deploy workflow.

## Validation Guidance

For changes to Pac-Man, use the smallest relevant validation set:

- `npm run build` for frontend/build changes
- `npm run deploy:build` only when the user wants a real local deployment

Avoid treating GitHub-hosted deploy as a current validation path until Automaton has a public endpoint.