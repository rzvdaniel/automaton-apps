#!/bin/sh
# Starts GoatCounter on the port Automaton assigns. The first start creates the database and the site.
set -eu

: "${GC_DOMAIN:?set GC_DOMAIN to the address the site is opened at}"
: "${GC_EMAIL:?set GC_EMAIL to the administrator email}"
: "${GC_PASSWORD:?set GC_PASSWORD to the administrator password}"

db="sqlite+${AUTOMATON_APP_DATA_DIR}/goatcounter.sqlite3"
if [ ! -f "${AUTOMATON_APP_DATA_DIR}/goatcounter.sqlite3" ]; then
	./goatcounter db create site -createdb -db "$db" \
		-vhost "$GC_DOMAIN" -user.email "$GC_EMAIL" -user.password "$GC_PASSWORD"
fi
exec ./goatcounter serve -db "$db" -listen ":${AUTOMATON_PORT}" -tls http -automigrate -email-from "$GC_EMAIL"
