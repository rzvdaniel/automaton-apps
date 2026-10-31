# Automaton Apps

Example apps built for [Automaton](https://automaton.monster), a platform for building, deploying, publishing, and running web apps on your own server.

[Automaton source](https://github.com/rzvdaniel/automaton) · [App documentation](https://automaton.monster/docs/) · [Automaton App Store](https://store.automaton.monster/)

## Apps

| App | Source |
| --- | --- |
| Untranslatable — a multiplayer word-bluffing game | [games/untranslatable](games/untranslatable/) |
| Automaton Blog | [blog](blog/) |
| IIS Tracker | [iis-tracker-v2](iis-tracker-v2/) |
| Image Converter Studio | [image-converter-studio](image-converter-studio/) |
| Space Invaders | [space-invaders](space-invaders/) |

Each app has its own source, dependencies, and `automaton.json`. Some examples use older deployment contracts; check the current [app documentation](https://automaton.monster/docs/) before deploying them. Inclusion here does not mean an app is currently published or running.

## Get started

Clone this repository and choose an app folder. Read its README, where available, and its `AGENTS.md` for app-specific guidance. There is no shared root build or dependency installation.

[Untranslatable's README](games/untranslatable/README.md) includes local run and deployment instructions for a dependency-free Node.js example.

To build your own app, follow the [Automaton quickstart](https://github.com/rzvdaniel/automaton#readme).

## Contributing

Keep changes within the relevant app folder, document any new setup requirements, and run that app's available checks before submitting a pull request. Do not commit credentials, local runtime data, or deployment secrets.

## License

This repository is licensed under the [Apache License 2.0](LICENSE). Third-party dependencies and assets retain their respective licenses.
