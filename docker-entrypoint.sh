#!/bin/sh
set -e

echo "Applying database migrations..."
(cd ./migrate && npx tsx ./migrate.ts)

# A fresh database has no users, so the middleware's default admin cookie
# resolves to nobody and every admin page bounces to /?authError=1. `--if-empty`
# makes this a no-op once there is data. SEED_ON_START=false skips it.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding database (skipped if it already has data)..."
  (cd ./migrate && npx tsx ./seed.ts --if-empty)
fi

echo "Starting app..."
exec "$@"
