#!/bin/sh
# Apply migrations, seed demo data on an empty DB (no-op otherwise), start the API.
set -e
npx prisma migrate deploy
node dist/prisma/seed.js
exec node dist/src/main.js
