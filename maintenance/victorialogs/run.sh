#!/bin/sh
# Starts VictoriaLogs on the port Automaton assigns. Retention comes from the app settings:
# RETENTION_PERIOD (how long) and MAX_DISK_SPACE_BYTES (a size cap such as 2GiB; 0 turns it off).
set -eu

exec ./victoria-logs-prod \
	-httpListenAddr=":${AUTOMATON_PORT}" \
	-storageDataPath="${AUTOMATON_APP_DATA_DIR}/victoria-logs-data" \
	-retentionPeriod="${RETENTION_PERIOD:-14d}" \
	-retention.maxDiskSpaceUsageBytes="${MAX_DISK_SPACE_BYTES:-2GiB}"
