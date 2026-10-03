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
  migrations/0001_rls_and_functions.sql   ruolo app, RLS, audit, regole del database, vista
                                delle scadenze effettive, login, numerazione
  tests/                        Vitest (dominio + catalogo), rls.test.sql (permessi, casi
                                fini), matrix.test.sql (la matrice dei permessi, cella per
                                cella), rules.test.sql (regole del database),
                                effective.dbtest.ts (parità fra database e TypeScript),
                                concurrency.dbtest.ts (scritture concorrenti)
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
pnpm db:seed        # associazione «Croce Gialla di Camerano» + catalogo (scritto una volta sola)
```

Il seed non crea mezzi né utenti: il parco si carica dai dati reali.

## Qualità

```bash
pnpm lint          # prettier --check
pnpm typecheck     # tsc strict
pnpm test          # Vitest: scadenze, abbinamento carburante, coerenza del catalogo

# su un DB migrato, con il ruolo applicativo vero; chiudono con ROLLBACK:
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rls.test.sql     # permessi
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/matrix.test.sql  # matrice §9
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rules.test.sql   # regole
pnpm test:db       # la vista delle scadenze, la prossima scadenza e i codici dei mezzi
                   # calcolati dal database coincidono con il TypeScript; adempimenti
                   # registrati insieme non si perdono
```

La CI esegue tutto questo su un Postgres vero, più due controlli: lo schema non
cambia senza la migration corrispondente, e un secondo seed non fa risorgere
ciò che è stato cancellato.

## Modificare lo schema

1. modificare i file in `packages/db/src/schema/`;
2. `pnpm db:generate` → nuova migration in `packages/db/migrations/`;
3. SQL non esprimibile in Drizzle (policy, trigger, funzioni):
   `pnpm --filter @fleetcare/db exec drizzle-kit generate --custom --name <nome>`.

Tre regole per ogni tabella nuova dell'associazione:

- **riferimenti con `tenantFk`**, mai `.references()` verso un'altra tabella
  dell'associazione, e `tenantKey` sulla tabella se altre la referenziano: la
  chiave composta `(tenant_id, id)` impedisce di puntare ai dati di un'altra
  associazione (vedi `src/schema/_schema.ts`);
- **RLS, isolamento e `known_role` nella sua migration**: la 0001 li applica
  alle tabelle che esistono quando gira. Se ci si dimentica, `rls.test.sql`
  fallisce: controlla che ogni tabella abbia RLS attiva, una policy
  `tenant_isolation` e una `known_role` scritte giuste, e che non ci siano
  altre policy permissive;
- **una riga nella matrice** di `tests/matrix.test.sql` (chi legge, inserisce,
  modifica, cancella) e nel §9 di `docs/analisi-campi.md`: il test fallisce
  per una tabella che non ce l'ha.

## Sicurezza

L'app si connette con il ruolo **`fleetcare_app`** (non superuser, soggetto a
RLS); ogni transazione apre il contesto con `withTenant()` di
`@fleetcare/db/client`. Le migration e il seed usano il ruolo owner.

⚠️ In produzione cambiare la password del ruolo:
`ALTER ROLE fleetcare_app PASSWORD '…'` e aggiornare `DATABASE_URL` su Coolify.
