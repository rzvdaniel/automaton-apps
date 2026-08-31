# ASP.NET Core Generic Runtime Acceptance

This is a small production-rollout fixture for the stack-neutral Automaton
application contract. It owns its HTTP server and uses only generic contract
fields for build, runtime, health, and durable application data.

The app writes a marker under `AUTOMATON_APP_DATA_DIR` on first startup and
returns the marker value from `/acceptance` without exposing the filesystem
path. That makes v1/v2 replacement and Runner restart checks observable
without putting durable state in the runtime artifact.

The build uses `build.sh`, which downloads and extracts the pinned .NET 9 SDK
into the application-owned `../.automaton-build/dotnet-sdk` directory beside
the extracted `source/` workspace when needed using only `curl` and `tar`.
`AUTOMATON_BUILD_WORKSPACE` can provide an explicit temporary build location.
The SDK stays outside the source tree and runtime output, then the script
publishes a Linux self-contained single-file executable into `out/`. The
runtime command is the artifact-relative `out/GenericRuntimeAspNet` executable;
it does not depend on a .NET runtime installed on the Runner.
