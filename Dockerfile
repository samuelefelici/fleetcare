# syntax=docker/dockerfile:1
# ============================================================
# FleetCare — immagine per Coolify (build pack «Dockerfile»).
# Coolify la costruisce a ogni push su main e sostituisce il container
# solo quando quello nuovo risponde all'healthcheck.
#
# Oggi il container prepara il database (migration, ruolo applicativo,
# seed, autocontrollo) e risponde a /health. Quando arriverà apps/web, lo
# stadio finale aggiungerà l'app e l'entrypoint la avvierà al posto di
# src/ops/server.ts: il resto non cambia.
# ============================================================

# L'immagine di partenza si può cambiare solo per le build locali dietro un
# proxy con un suo certificato (vedi docs/deploy-coolify.md); su Coolify
# resta questa.
ARG NODE_IMAGE=node:22-alpine

# ---- base: Node 22 e pnpm alla versione di package.json (corepack) ----
FROM ${NODE_IMAGE} AS base
RUN corepack enable
WORKDIR /app

# ---- ① prune: solo i pacchetti del workspace che servono ----
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.7 prune @fleetcare/db --docker

# ---- ② deps: dipendenze di produzione dal lockfile ----
# --prod esplicito: non dipende da NODE_ENV (che su Coolify non va reso
# disponibile al build, e qui non serve).
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile --prod

# ---- ③ runtime: non-root ----
FROM base AS runner
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/ .
COPY --from=pruner /app/out/full/ .
COPY docker/entrypoint.sh /entrypoint.sh
USER node
EXPOSE 3000
# Coolify usa questo HEALTHCHECK se quello della UI è spento (il default):
# aspetta start-period, poi controlla fino a retries volte ogni interval.
# Se il container nuovo non diventa sano entro ~2 minuti lo scarta e tiene
# il vecchio. start-period copre le migration e il seed del primo avvio.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["/entrypoint.sh"]
