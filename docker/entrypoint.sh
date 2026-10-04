#!/bin/sh
# Avvio del container FleetCare (Coolify):
#   1. prepara il database: migration, ruolo applicativo, permessi, seed,
#      prima utenza, autocontrollo (packages/db/src/ops/prepare.ts). Se
#      fallisce il container non parte: meglio la versione precedente
#      ancora in piedi che una su un database a metà;
#   2. avvia l'app Next.js (standalone), che risponde anche a /api/health.
# `exec`: il processo node riceve direttamente il SIGTERM di Coolify.
set -e
cd /app/db/packages/db
node --import tsx src/ops/prepare.ts
cd /app/web
exec node apps/web/server.js
