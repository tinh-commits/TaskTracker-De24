#!/bin/sh
set -eu
: "${APP_DB_USER:?}"
: "${APP_DB_PASSWORD:?}"
: "${METRICS_DB_USER:?}"
: "${METRICS_DB_PASSWORD:?}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
  -v metric_user="$METRICS_DB_USER" -v metric_password="$METRICS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'metric_user', :'metric_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'metric_user') \gexec
SELECT format('GRANT pg_monitor TO %I', :'metric_user') \gexec
SQL
