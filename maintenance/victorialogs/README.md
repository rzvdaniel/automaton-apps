# VictoriaLogs for Automaton

This package runs [VictoriaLogs](https://github.com/VictoriaMetrics/VictoriaLogs), the log database by VictoriaMetrics, licensed [Apache-2.0](LICENSE.upstream.txt). The build downloads the official, unmodified v1.54.0 release binary for the Runner's CPU (amd64 or arm64) and checks its SHA-256 (`build.sh`). The upstream container image has no shell and the contract does not allow an absolute executable, so the image itself cannot be used as the runtime.

Open the app and go to **Logs** (`/select/vmui/`): search, filter and live tail. Logs live in `AUTOMATON_APP_DATA_DIR/victoria-logs-data`. Install it as private, so only people who may open the app can read the logs: logs can contain addresses and user names. Do not make it public.

## Retention

Defaults, set as app settings: `RETENTION_PERIOD` = `14d` and `MAX_DISK_SPACE_BYTES` = `5GiB`. Saving a setting restarts the app. Whichever limit is reached first drops the oldest days. VictoriaLogs also has a percentage cap (`-retention.maxDiskUsagePercent`); it is mutually exclusive with the size cap, and this package offers the size cap only.

## Ship the server's logs here

Set `Logging__Otlp__Endpoint` to this app's address, for example `http://<app address>:9428`, on the API, the Worker and each Runner, then restart them. They keep their log files and also send logs over OpenTelemetry (OTLP/HTTP, protobuf) to `/insert/opentelemetry/v1/logs`. A bare address gets that path added. Every record carries `service.name` (`automaton-api`, `automaton-worker`, `automaton-runner`) and `host.name`. Example searches:

```
_time:1h severity_text:Error
_time:1h severity_text:Error service.name:automaton-worker "BrokerUnreachableException"
```

Not included yet: collecting Docker container output (Traefik, Postgres, apps). It needs a Docker log read permission the platform does not have; see automaton#1235.

## Home card

`actions/home-card` counts errors and warnings of the last hour and returns `{ status, facts, alerts }`. It reads the `LOGS_URL` setting (the address of this app reachable from the Action) and stays off while it is empty. The platform schedules it once the Home card feature (automaton#1232) ships.

VictoriaLogs has no sign-in of its own: anything that can reach its port on the server's internal network can read and write logs. Automaton's sign-in protects only the browser address. Use `http` for an endpoint on the same server or Docker network; a remote Runner should reach it through `https`.
