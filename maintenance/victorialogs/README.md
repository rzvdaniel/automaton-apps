# VictoriaLogs for Automaton

This package runs [VictoriaLogs](https://github.com/VictoriaMetrics/VictoriaLogs), the log database by VictoriaMetrics, licensed [Apache-2.0](LICENSE.upstream.txt). The build downloads the official, unmodified v1.54.0 release binary for the Runner's CPU (amd64 or arm64) and checks its SHA-256 (`build.sh`). The upstream container image has no shell and the contract does not allow an absolute executable, so the image itself cannot be used as the runtime.

Open the app (Open app goes to **Logs**, `/select/vmui/`): search, filter and live tail. Logs live in `AUTOMATON_APP_DATA_DIR/victoria-logs-data`. Install it as private, so only people who may open the app can read the logs: logs can contain addresses and user names. Do not make it public.

## Retention

Defaults, set as app settings: `RETENTION_PERIOD` = `14d` and `MAX_DISK_SPACE_BYTES` = `5GiB`. Saving a setting restarts the app. Whichever limit is reached first drops the oldest days. VictoriaLogs also has a percentage cap (`-retention.maxDiskUsagePercent`); it is mutually exclusive with the size cap, and this package offers the size cap only.

## Ship the server's logs here

The app declares `"permissions": ["logs:receive"]`. A system administrator approves it on the install page (or later under the app's Admin tab); from then on, with no setting and no command, the Automaton API, Worker and the Runner that hosts this app send their logs here over OpenTelemetry (OTLP/HTTP, protobuf, `/insert/opentelemetry/v1/logs`) within about a minute. Automaton finds the app's current address itself, so restarts, redeploys and reboots need nothing. Pausing, uninstalling or revoking the permission stops it quietly. A Runner on another machine sends nothing until you set `Logging__Otlp__Endpoint` for it to an `https` address; the same setting on the API, Worker or a Runner always wins over the automatic choice. Needs Automaton 0.2.168 or newer. Every record carries `service.name` (`automaton-api`, `automaton-worker`, `automaton-runner`) and `host.name`. Example searches:

```
_time:1h severity_text:Error
_time:1h severity_text:Error service.name:automaton-worker "BrokerUnreachableException"
```

Not included yet: collecting Docker container output (Traefik, Postgres, apps). It needs a Docker log read permission the platform does not have; see automaton#1235.

## Home card

`actions/home-card` draws the Home card: counters for logs, errors and warnings of the last hour, a small chart of log volume over 24 hours and a storage meter (used and free disk from the server's own `/metrics`; left out when it does not report them). It asks this app at `AUTOMATON_APP_INTERNAL_URL`, so it works right after install; set `LOGS_URL` only to point it at another VictoriaLogs. When it cannot show data it shows one line with the reason and a Set up link, and when the API, Worker and Runners have sent no logs yet it says that an administrator approves `logs:receive`; the line goes away once logs arrive. Detailed searching stays in the app.

VictoriaLogs has no sign-in of its own: anything that can reach its port on the server's internal network can read and write logs. Automaton's sign-in protects only the browser address. Use `http` for an endpoint on the same server or Docker network; a remote Runner should reach it through `https`.
