#!/bin/sh
# Starts the upstream Ghost image. The image is read-only, so content (themes, images, SQLite) lives in the app data dir.
set -eu
: "${GHOST_URL:?set GHOST_URL to the address the blog is opened at}"
export GHOST_CONTENT="$AUTOMATON_APP_DATA_DIR/content"
mkdir -p "$GHOST_CONTENT"
export url="$GHOST_URL" server__host=0.0.0.0 server__port="$AUTOMATON_PORT"
export paths__contentPath="$GHOST_CONTENT"
export database__client=sqlite3 database__connection__filename="$GHOST_CONTENT/data/ghost.db"
if [ -n "${MAIL_FROM:-}" ]; then export mail__from="$MAIL_FROM"; fi
if [ -n "${SMTP_HOST:-}" ]; then
	export mail__transport=SMTP mail__options__host="$SMTP_HOST" mail__options__port="${SMTP_PORT:-587}"
	if [ -n "${SMTP_USER:-}" ]; then export mail__options__auth__user="$SMTP_USER" mail__options__auth__pass="${SMTP_PASSWORD:-}"; fi
fi
# Newsletters need Mailgun's API; without it Ghost shows newsletters as not configured.
if [ -n "${MAILGUN_API_KEY:-}" ] && [ -n "${MAILGUN_DOMAIN:-}" ]; then
	case "${MAILGUN_REGION:-EU}" in
		US|us) base=https://api.mailgun.net/v3 ;;
		*) base=https://api.eu.mailgun.net/v3 ;;
	esac
	export bulkEmail__mailgun__apiKey="$MAILGUN_API_KEY" bulkEmail__mailgun__domain="$MAILGUN_DOMAIN" bulkEmail__mailgun__baseUrl="$base"
else
	echo "Newsletters are off: set MAILGUN_API_KEY and MAILGUN_DOMAIN to turn them on."
fi
cd /var/lib/ghost
exec docker-entrypoint.sh node current/index.js
