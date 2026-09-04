#!/bin/sh
set -e

echo "Applying database migrations..."
(cd ./migrate && npx tsx ./migrate.ts)

echo "Starting app..."
exec "$@"
