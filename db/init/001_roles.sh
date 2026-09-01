#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=database_name="$POSTGRES_DB" \
  --set=loader_password="$POSTGRES_LOADER_PASSWORD" \
  --set=ui_password="$POSTGRES_UI_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE ai_profiler_loader LOGIN PASSWORD %L', :'loader_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_profiler_loader')
\gexec

SELECT format('ALTER ROLE ai_profiler_loader PASSWORD %L', :'loader_password')
\gexec

SELECT format('CREATE ROLE ai_profiler_ui LOGIN PASSWORD %L', :'ui_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_profiler_ui')
\gexec

SELECT format('ALTER ROLE ai_profiler_ui PASSWORD %L', :'ui_password')
\gexec

ALTER ROLE ai_profiler_ui SET default_transaction_read_only = on;
GRANT CONNECT, CREATE ON DATABASE :"database_name" TO ai_profiler_loader;
GRANT CONNECT ON DATABASE :"database_name" TO ai_profiler_ui;
SQL
