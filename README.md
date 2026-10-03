# FleetCare

Gestione del parco mezzi per associazioni di soccorso e trasporto sanitario
(ambulanze, automediche, pulmini per disabili). Primo caso: **Croce Gialla di
Camerano**, circa 20 mezzi; lo schema è multi-associazione fin dall'inizio.

> **Da leggere prima del codice:** [`docs/analisi-campi.md`](docs/analisi-campi.md):
> quali dati servono e perché, cosa viene dal gestionale TPL (`fleetmanagement`)
> e cosa no, le scadenze normative precaricate, le decisioni ancora aperte.

## Cosa c'è

Per ora il **database**: schema, migration, RLS, logica di dominio pura e il
catalogo iniziale. L'app (`apps/web`) è il passo successivo.

```
packages/db                     @fleetcare/db
  src/schema/                   schema Drizzle: fonte unica dei tipi (35 tabelle)
  src/domain/deadlines.ts       motore delle scadenze (prossima scadenza, stato, semaforo)
  src/domain/fuel-reconciliation.ts   abbinamento fattura del distributore ↔ rifornimenti
  src/domain/labels.ts          etichette italiane degli enum
  src/seed/catalog.ts           catalogo iniziale: scadenze, attrezzature, dotazione, check-list
  migrations/0000_init.sql      generata da drizzle-kit
  migrations/0001_rls_and_functions.sql   ruolo app, RLS per ruolo, audit, trigger km, login
  tests/                        Vitest (dominio + catalogo) e rls.test.sql (policy)
docs/analisi-campi.md           l'analisi
```

Stack: monorepo pnpm/Turborepo, TypeScript strict, PostgreSQL 17, Drizzle ORM,
postgres.js. Stessa toolchain di `fleetmanagement`.

## Sviluppo locale

Prerequisiti: Node 22, pnpm 10, Docker.

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 17 + MinIO
pnpm install
cp .env.example .env
export DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/fleetcare

pnpm db:migrate     # schema + ruolo fleetcare_app + RLS
pnpm db:seed        # associazione «Croce Gialla di Camerano» + catalogo (idempotente)
```

Il seed non crea mezzi né utenti: il parco si carica dai dati reali.

## Qualità

```bash
pnpm lint          # prettier --check
pnpm typecheck     # tsc strict
pnpm test          # Vitest: scadenze, abbinamento carburante, coerenza del catalogo

# policy RLS, con il ruolo applicativo vero (serve un DB migrato):
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rls.test.sql
```

La CI esegue tutto questo su un Postgres vero, più un controllo che fallisce se
lo schema cambia senza la migration corrispondente.

## Modificare lo schema

1. modificare i file in `packages/db/src/schema/`;
2. `pnpm db:generate` → nuova migration in `packages/db/migrations/`;
3. SQL non esprimibile in Drizzle (policy, trigger, funzioni):
   `pnpm --filter @fleetcare/db exec drizzle-kit generate --custom --name <nome>`.

Ogni nuova tabella con `tenant_id` riceve RLS e isolamento solo se la migration
lo dice: la 0001 li applica alle tabelle che esistono quando gira. Per le
tabelle nuove vanno aggiunti nella loro migration. Se ci si dimentica,
`rls.test.sql` fallisce: controlla che ogni tabella dello schema abbia RLS
attiva e la policy `tenant_isolation`.

## Sicurezza

L'app si connette con il ruolo **`fleetcare_app`** (non superuser, soggetto a
RLS); ogni transazione apre il contesto con `withTenant()` di
`@fleetcare/db/client`. Le migration e il seed usano il ruolo owner.

⚠️ In produzione cambiare la password del ruolo:
`ALTER ROLE fleetcare_app PASSWORD '…'` e aggiornare `DATABASE_URL` su Coolify.
