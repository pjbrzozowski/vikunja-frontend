#!/bin/bash

# This shell script sets the api url based on an environment variable and starts nginx in foreground.

VIKUNJA_API_URL="${VIKUNJA_API_URL:-"/api/v1"}"
VIKUNJA_SENTRY_ENABLED="${VIKUNJA_SENTRY_ENABLED:-"false"}"
VIKUNJA_SENTRY_DSN="${VIKUNJA_SENTRY_DSN:-"https://85694a2d757547cbbc90cd4b55c5a18d@o1047380.ingest.sentry.io/6024480"}"
VIKUNJA_HTTP_PORT="${VIKUNJA_HTTP_PORT:-80}"
VIKUNJA_HTTPS_PORT="${VIKUNJA_HTTPS_PORT:-443}"

echo "Using $VIKUNJA_API_URL as default api url"

# Escape the variable to prevent sed from complaining
VIKUNJA_API_URL=$(echo $VIKUNJA_API_URL |sed 's/\//\\\//g')

sed -i "s/http\:\/\/localhost\:3456//g" /usr/share/nginx/html/index.html # replacing in two steps to make sure api urls from releases are properly replaced as well
sed -i "s/'\/api\/v1/'$VIKUNJA_API_URL/g" /usr/share/nginx/html/index.html
sed -i "s/\.SENTRY_ENABLED = false/\.SENTRY_ENABLED = $VIKUNJA_SENTRY_ENABLED/g" /usr/share/nginx/html/index.html
sed -i "s|\.SENTRY_DSN = '.*'|\.SENTRY_DSN = '$VIKUNJA_SENTRY_DSN'|g" /usr/share/nginx/html/index.html

sed -i "s/listen 80/listen $VIKUNJA_HTTP_PORT/g" /etc/nginx/nginx.conf
sed -i "s/listen 443/listen $VIKUNJA_HTTPS_PORT/g" /etc/nginx/nginx.conf

nginx -g "daemon off;"
