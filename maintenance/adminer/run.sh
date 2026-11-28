#!/bin/sh
# Starts the upstream Adminer image's own web server (PHP built-in) on the app port. Nothing is stored: users type
# the database host, user and password at sign-in.
set -eu
cd /var/www/html
exec php -S 0.0.0.0:8080 -t /var/www/html
