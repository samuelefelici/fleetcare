#!/bin/sh
# Avvio del container FleetCare (Coolify):
#   1. prepara il database: migration, ruolo applicativo, seed, autocontrollo
#      (packages/db/src/ops/prepare.ts). Se fallisce il container non parte:
#      meglio la versione precedente ancora in piedi che una su un database
#      a metà;
#   2. avvia il processo che risponde a Coolify (per ora solo /health).
# `exec`: il processo node riceve direttamente il SIGTERM di Coolify.
set -e
cd /app/packages/db
node --import tsx src/ops/prepare.ts
exec node --import tsx src/ops/server.ts
