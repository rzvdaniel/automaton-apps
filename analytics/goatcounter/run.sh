#!/bin/sh
# Starts GoatCounter on the port Automaton assigns. The first start creates the database and the site;
# every start then applies the current GC_DOMAIN and GC_PASSWORD to the first site and user.
set -eu

: "${GC_DOMAIN:?set GC_DOMAIN to the address the site is opened at}"
: "${GC_EMAIL:?set GC_EMAIL to the administrator email}"
: "${GC_PASSWORD:?set GC_PASSWORD to the administrator password}"

db="sqlite+${AUTOMATON_APP_DATA_DIR}/goatcounter.sqlite3"
if [ ! -f "${AUTOMATON_APP_DATA_DIR}/goatcounter.sqlite3" ]; then
	./goatcounter db create site -createdb -db "$db" \
		-vhost "$GC_DOMAIN" -user.email "$GC_EMAIL" -user.password "$GC_PASSWORD"
else
	# Settings changed in Studio apply on restart. Site 1 and user 1 are the ones created above. No output of the password.
	./goatcounter db update site -db "$db" -find 1 -vhost "$GC_DOMAIN"
	./goatcounter db update user -db "$db" -find 1 -password "$GC_PASSWORD"
fi
exec ./goatcounter serve -db "$db" -listen ":${AUTOMATON_PORT}" -tls http -automigrate -email-from "$GC_EMAIL"
