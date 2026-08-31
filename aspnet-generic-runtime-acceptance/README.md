# ASP.NET Core Generic Runtime Acceptance

This is a small production-rollout fixture for the stack-neutral Automaton
application contract. It owns its HTTP server and uses only generic contract
fields for build, runtime, health, and durable application data.

The app writes a marker under `AUTOMATON_APP_DATA_DIR` on first startup and
returns it from `/acceptance`. That makes v1/v2 replacement and Runner restart
checks observable without putting durable state in the runtime artifact.

The runtime executable is the PATH-resolved `dotnet` command. Its argument is
`out/GenericRuntimeAspNet.dll`, relative to the runtime artifact root, while
the working directory remains `.`.
