#!/bin/sh
# Starts File Browser on the port Automaton assigns. The root folder is files/ in the app's data volume.
# Inside Automaton (AUTOMATON_API_URL is set) Automaton's sign-in is in front, so File Browser's own login is off.
# On its own it keeps its login: FB_ADMIN_PASSWORD (at least 12 characters) is the password of the user "admin".
set -eu

DATA="${AUTOMATON_APP_DATA_DIR:-data}"
DB="$DATA/filebrowser.db"
ROOT="$DATA/files"
mkdir -p "$ROOT"

if [ -n "${AUTOMATON_API_URL:-}" ]; then
	METHOD="noauth"
else
	METHOD="json"
	if [ -z "${FB_ADMIN_PASSWORD:-}" ] || [ "${#FB_ADMIN_PASSWORD}" -lt 12 ]; then
		echo "Run on its own, set FB_ADMIN_PASSWORD to at least 12 characters." >&2
		exit 1
	fi
fi

if [ ! -f "$DB" ]; then
	./filebrowser config init -d "$DB" --auth.method="$METHOD" >/dev/null
	# Under noauth every visitor is user 1, so the admin user must exist first; its password is never used there.
	PASSWORD="${FB_ADMIN_PASSWORD:-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
	./filebrowser users add admin "$PASSWORD" --perm.admin -d "$DB" >/dev/null
else
	./filebrowser config set -d "$DB" --auth.method="$METHOD" >/dev/null
fi
if [ "$METHOD" = "json" ]; then
	./filebrowser users update admin --password "$FB_ADMIN_PASSWORD" -d "$DB" >/dev/null
fi

exec ./filebrowser -d "$DB" -r "$ROOT" -a 0.0.0.0 -p "${AUTOMATON_PORT:-8080}"
