#! /bin/sh

set -eu

file="${1:-}"

if [ -z "$file" ]; then
	file=$(ls backups/mydatabase_*.bak | tail -n 1)
fi

if [ ! -s "$file" ]; then
	echo "Error: no restore possible" >&2
	exit 1
fi

echo "restoring $file"

docker compose up -d --wait db
trap 'docker compose up -d backend' EXIT
docker compose stop backend
docker compose exec -T db sh -c 'export PGOPTIONS="-c client_min_messages=warning" &&
	tmp="${POSTGRES_DB}_restore" &&
	dropdb -U "$POSTGRES_USER" --force --if-exists "$tmp" &&
	createdb -U "$POSTGRES_USER" "$tmp" &&
	psql -q -U "$POSTGRES_USER" -d "$tmp" --single-transaction -v ON_ERROR_STOP=1 >/dev/null &&
	dropdb -U "$POSTGRES_USER" --force --if-exists "$POSTGRES_DB" &&
	psql -q -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$tmp\" RENAME TO \"$POSTGRES_DB\""' < "$file"

echo "Restore done ! Run 'make up' if other services are stopped"
