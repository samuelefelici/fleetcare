# syntax=docker/dockerfile:1
# ============================================================
# FleetCare — immagine per Coolify (build pack «Dockerfile»).
# Coolify la costruisce a ogni push e sostituisce il container solo quando
# quello nuovo risponde all'healthcheck (/api/health).
#
# Nell'immagine finale ci sono due cose, separate:
#   /app/db   il pacchetto @fleetcare/db con le sue dipendenze: all'avvio
#             prepara il database (migration, ruolo, permessi, seed, prima
#             utenza, autocontrollo), vedi docker/entrypoint.sh;
#   /app/web  l'app Next.js in forma «standalone», che poi resta in ascolto.
# ============================================================

# L'immagine di partenza si può cambiare solo per le build locali dietro un
# proxy con un suo certificato (vedi docs/deploy-coolify.md); su Coolify
# resta questa.
ARG NODE_IMAGE=node:22-alpine

# ---- base: Node 22 e pnpm alla versione di package.json (corepack) ----
FROM ${NODE_IMAGE} AS base
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- ① prune: solo i pacchetti del workspace che servono all'app ----
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.7 prune web --docker

# ---- ② build dell'app: tutte le dipendenze, poi next build ----
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# turbo prune non porta i file della radice: tsconfig.base.json serve all'extends
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
# al build le variabili non ci sono (e non devono esserci)
ENV SKIP_ENV_VALIDATION=1
RUN pnpm --filter web build

# ---- ③ dipendenze di produzione del solo pacchetto db, per l'avvio ----
# --prod esplicito: non dipende da NODE_ENV (che su Coolify non va reso
# disponibile al build, e qui non serve).
FROM base AS dbdeps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile --prod --filter @fleetcare/db
COPY --from=pruner /app/out/full/packages/db ./packages/db

# ---- ④ runtime: non-root ----
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=dbdeps --chown=node:node /app /app/db
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone /app/web
COPY --from=builder --chown=node:node /app/apps/web/.next/static /app/web/apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public /app/web/apps/web/public
COPY docker/entrypoint.sh /entrypoint.sh
USER node
EXPOSE 3000
# Coolify usa questo HEALTHCHECK se quello della UI è spento (il default):
# aspetta start-period, poi controlla fino a retries volte ogni interval.
# Se il container nuovo non diventa sano entro ~2 minuti lo scarta e tiene
# il vecchio. start-period copre migration e seed del primo avvio.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["/entrypoint.sh"]
