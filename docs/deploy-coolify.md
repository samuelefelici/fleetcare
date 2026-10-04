# FleetCare su Coolify

Come si mette in produzione FleetCare sul Coolify del server Hetzner, e
perché così. Ogni passo finisce con un **checkpoint**: non si va avanti
finché non torna. I passi irreversibili sono segnati con ⚠️.

I fatti su Coolify vengono dalla sua documentazione e dal suo codice
sorgente (v4.3.23 e main 4.4.0, ottobre 2026). I nomi dei campi della UI
cambiano da una versione all'altra: dove differiscono sono scritti tutti e
due.

---

## 1. La scelta: un Dockerfile, e il database come risorsa a parte

**L'app è una Application con build pack «Dockerfile»; PostgreSQL è una
risorsa Database di Coolify, separata.** Niente Docker Compose.

| | Dockerfile + risorsa PostgreSQL | Docker Compose con il database dentro |
|---|---|---|
| Aggiornamento | il container nuovo parte accanto al vecchio e lo sostituisce solo quando risponde all'healthcheck; se non risponde, resta il vecchio | Coolify ferma tutto e poi riavvia: un'interruzione a ogni push, e non aspetta che i servizi siano sani |
| Backup del database | schedulati da Coolify, su S3, con restore dalla UI | per un database dentro una compose collegata a GitHub **non esistono** (issue coollabsio/coolify#7528, aperta) |
| Ciclo di vita del database | indipendente dai deploy dell'app | legato alla stack: un deploy tocca anche il database |

È la stessa architettura di `fleetmanagement`, con una differenza voluta:
lì il database è quello condiviso di Cerbero, qui è **dedicato** (decisione
2 dell'analisi).

**Il database è `postgres:17-alpine`, non PostGIS.** FleetCare non ha dati
spaziali, e l'immagine `postgis/postgis` crea da sola, in ogni database
nuovo, gli schemi `tiger` e `topology`: provato qui, il ripristino di un
backup di Coolify in un database nuovo fallisce per intero («schema tiger
already exists»). Postgres 17 è anche quello su cui girano CI e test.

### Cosa fa il container a ogni avvio

`docker/entrypoint.sh` → `packages/db/src/ops/prepare.ts`, poi il server:

1. **migration**, una alla volta anche con due container (advisory lock).
   Se una migration già applicata è stata modificata, si ferma: drizzle la
   salterebbe in silenzio;
2. **ruolo applicativo `fleetcare_app`**: lo crea se manca, niente
   superutente né bypass della RLS, e la password diventa quella scritta in
   `DATABASE_URL` (una sola fonte: la variabile di Coolify);
3. **permessi** del ruolo riapplicati (`fleetcare.apply_app_privileges()`):
   il backup di Coolify non li contiene (vedi §4);
4. **seed** dell'associazione, se c'è `SEED_TENANT_SLUG` (una volta sola);
5. **autocontrollo** con la connessione dell'app: utenza giusta, RLS,
   permessi, policy, niente tabelle temporanee.

Se uno di questi passi fallisce, il container esce con errore: Coolify lo
scarta e tiene in piedi la versione precedente. Poi parte il processo che
risponde a `GET /health` (oggi c'è solo quello: l'app web arriverà al suo
posto, nello stesso container).

Le migration stanno nell'avvio del container e non nei comandi di
pre/post-deployment di Coolify: il pre-deployment gira nel container
**vecchio**, prima della build, quindi con il codice vecchio; il
post-deployment gira quando il traffico è già passato alla versione nuova,
e un suo errore non fa fallire il deploy.

---

## 2. Prima di iniziare

- **Versione di Coolify** (in basso a sinistra nella UI): decide i nomi dei
  campi.
- **Un bucket S3 per i backup, fuori dal server.** Su Hetzner è *Object
  Storage* (la Storage Box non parla S3). Crearlo prima: Coolify lo
  verifica ma non lo crea.
- **Due password nuove**, di soli lettere e cifre (niente da codificare
  negli URL):
  ```bash
  openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32; echo
  ```
  una per l'utente `postgres` (se non si usa quella generata da Coolify),
  una per `fleetcare_app`.

---

## 3. Passi

### 3.1 Progetto

*Projects → + Add*: progetto **FleetCare**, ambiente **production**.

### 3.2 PostgreSQL ⚠️ l'immagine si sceglie adesso

*+ New → Database → PostgreSQL*, scegliendo **PostgreSQL 17**
(`postgres:17-alpine`).

⚠️ Non creare la risorsa con un'altra versione per poi cambiare «Image»:
Coolify fissa il percorso del volume dati alla creazione (PG 18 usa
`/var/lib/postgresql`, PG 17 `/var/lib/postgresql/data`), e dopo il cambio
i dati finirebbero in un volume anonimo.

- **Name**: `fleetcare-db`
- **Initial database**: `fleetcare`
- **Username**: `postgres`, **Password**: quella generata
- **Accesso pubblico** («Make it publicly available» / «Public access»):
  **spento**. Le porte pubblicate da Docker scavalcano anche il firewall
  del sistema (UFW).
- Per entrare dal proprio PC, se serve: «Port mappings» →
  `127.0.0.1:15432:5432` (solo sul server), poi un tunnel SSH:
  `ssh -L 15432:127.0.0.1:15432 root@<server>`.

*Start*.

**Checkpoint**: la risorsa è *Running*. Copiare «Postgres URL (internal)»
(nella documentazione «Internal URL»): l'host è l'identificativo della
risorsa, per esempio `postgres://postgres:…@k8s0g4c…:5432/fleetcare`.

### 3.3 Backup

1. *Settings → S3 Storages → + Add*: provider **Hetzner**, endpoint
   dell'Object Storage (per esempio `https://fsn1.your-objectstorage.com`),
   regione, bucket, chiavi. *Validate*.
2. Sulla risorsa `fleetcare-db`: *Backups → + Add* (accanto a «Scheduled
   Backups»):
   - **Frequency**: `30 0 * * *`, cioè ogni notte. L'orario è nel fuso del
     server, di solito UTC: 00:30 UTC sono le 01:30 o le 02:30 a Roma;
   - **Databases**: solo `fleetcare` («Specific databases»);
   - **S3**: attivo, sullo storage appena creato;
   - **Retention**: ⚠️ il default è 0, cioè «per sempre», sia sul disco sia
     su S3. Mettere per esempio 7 backup in locale e 30 giorni su S3.

**Checkpoint**: *Backup Now* → il backup compare nella lista come riuscito,
e il file `.dmp` è nel bucket.

### 3.4 Application

*+ New → Private Repository (with GitHub App)* → `samuelefelici/fleetcare`.

- **Branch**: `main`
- **Build pack**: `Dockerfile`
- **Base Directory**: `/`; **Dockerfile Location**: `/Dockerfile`
- **Ports Exposes**: `3000`
- **Domains**: per ora vuoto. Oggi il container risponde solo a `/health`;
  il dominio servirà con l'app web.
- **Healthcheck** nella UI: **spento** (il default). Coolify usa allora
  l'`HEALTHCHECK` del Dockerfile. Accesi tutti e due, quello della UI
  sostituisce quello del Dockerfile.
- **Preview deployments**: ⚠️ **spenti**. Una preview eredita le variabili
  di produzione: con `DATABASE_ADMIN_URL` di produzione il container della
  PR migrerebbe il database vero con il codice della PR.
- **Pre-deployment / Post-deployment command**: vuoti.
- **Ports Mappings**, **Custom Container Name**, nome del container fisso:
  non impostarli, disattivano l'aggiornamento senza interruzione.

### 3.5 Variabili d'ambiente ⚠️ nessuna al build

*Environment Variables*. Per **ognuna** togliere la disponibilità al build
(«Available at Buildtime» / «Is Build Variable?» nelle versioni vecchie;
«Build time: Not available during build» dalla 4.3): Coolify le crea
disponibili al build, e allora finiscono come build argument
nell'immagine. Il Dockerfile non ne usa nessuna.

| Variabile | Valore |
|---|---|
| `DATABASE_ADMIN_URL` | il «Postgres URL (internal)» copiato al §3.2 (utente `postgres`) |
| `DATABASE_URL` | lo stesso host, con l'utente `fleetcare_app` e la sua password: `postgres://fleetcare_app:<password>@<host>:5432/fleetcare` |
| `SEED_TENANT_SLUG` | `croce-gialla-camerano` |
| `SEED_TENANT_NAME` | `Croce Gialla di Camerano` |
| `SEED_TENANT_NETWORK`, `SEED_TENANT_CITY`, `SEED_TENANT_PROVINCE` | `ANPAS`, `Camerano`, `AN` (facoltative) |

`NODE_ENV` non va impostata: è già nel Dockerfile, e resa disponibile al
build farebbe saltare a pnpm parte delle dipendenze.

La password di `fleetcare_app` **non si imposta a mano**: la scrive il
container a ogni avvio prendendola da `DATABASE_URL`. Per cambiarla basta
cambiare la variabile e fare *Redeploy*.

### 3.6 Primo deploy

*Deploy*.

**Checkpoint**, nei log del deploy:

```
[fleetcare] migration: 2 applicate
[fleetcare] ruolo applicativo: password da DATABASE_URL, permessi riapplicati, niente superutente né TEMP
Seed «Croce Gialla di Camerano»: 15 tipi di scadenza, 17 tipi di attrezzatura, 64 regole, …
[fleetcare] autocontrollo:
  ok  database: «fleetcare» come «fleetcare_app»
  ok  ruolo applicativo: fleetcare_app, soggetto alla RLS
  ok  oggetti temporanei: non consentiti
  ok  permessi: lettura su tutte le tabelle
  ok  policy: isolamento e ruolo valido su ogni tabella
  ok  RLS: attiva su 35 tabelle
[fleetcare] in ascolto sulla porta 3000 (GET /health)
```

e, nel log di Coolify, «Custom healthcheck found in Dockerfile» e «New
container is healthy»: l'applicazione risulta *Running (healthy)*. Dal
*Terminal* del container: `wget -qO- 127.0.0.1:3000/health` →
`{"ok":true}`. Il *Terminal* lo apre solo un owner o admin del team, e sul
server dev'essere attivo *Terminal Access* (Servers → server → Security).

Se una riga dice `NO`, il container non parte e il messaggio dice cosa
manca. Il caso più probabile è `DATABASE_URL` scritto con l'utente
`postgres`: il container lo rifiuta, perché l'app scavalcherebbe tutte le
regole su chi vede che cosa.

### 3.7 Prova di ripristino, subito

Prima che ci siano dati veri, una volta: §4, su una risorsa PostgreSQL di
prova creata apposta. Un backup mai ripristinato non è un backup.

---

## 4. Ripristino (procedura provata)

**Cosa c'è nel backup.** Coolify fa `pg_dump --format=custom --no-acl
--no-owner` del database (`app/Jobs/DatabaseBackupJob.php`). Contiene
schemi, dati, RLS e policy. **Non** contiene il ruolo `fleetcare_app` (i
ruoli sono del server, non del database), né i GRANT (`--no-acl`), né la
revoca delle tabelle temporanee. I permessi li riapplica il container al
primo avvio; il ruolo invece deve esistere **prima** del ripristino,
perché le policy lo citano.

Passi:

1. Se il ripristino va in una risorsa nuova: creala come al §3.2 (PostgreSQL
   17, database `fleetcare`).
2. Dal *Terminal* della risorsa database:
   ```bash
   psql -U postgres -d fleetcare -c "create role fleetcare_app login"
   ```
   (la password la metterà il container). Se il ruolo c'è già, l'errore
   «already exists» va bene.
3. ⚠️ *Import Backup* (sotto «Configuration»): dal file o da S3. Se il
   database ha già dei dati: «Replace objects that already exist». Dalla
   4.4 l'import è una transazione unica: se manca il ruolo fallisce e non
   cambia niente. Nella 4.3 il comando è modificabile: usare
   ```bash
   pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U $POSTGRES_USER -d ${POSTGRES_DB:-postgres}
   ```
   così un errore annulla tutto invece di lasciare un ripristino a metà.
4. Sull'application: se il database è nuovo, aggiornare host in
   `DATABASE_ADMIN_URL` e `DATABASE_URL`; poi *Redeploy* (o *Restart*).

**Checkpoint**: l'autocontrollo nei log è tutto `ok` (in particolare
«permessi» e «policy»), e i dati ci sono. Senza il passo 2 l'import fallisce
(4.4) oppure, nella 4.3 col comando di default, le policy mancano e il
container non parte con `NO policy`: si rifà il ripristino con il ruolo.

Provato in locale con i comandi esatti di Coolify su `postgres:17-alpine`:
- senza ruolo, il ripristino fallisce e non cambia niente;
- con il ruolo, riesce, ma l'app non ha permessi e le tabelle temporanee
  sono di nuovo permesse;
- dopo l'avvio del container i permessi sono tornati, i dati ci sono, e
  `rls.test.sql`, `matrix.test.sql` e `rules.test.sql` passano sul database
  ripristinato.

---

## 5. Da qui in avanti

- **Una migration applicata in produzione non si tocca più.** Fino al primo
  deploy le migration si sono riscritte, ma da qui le modifiche allo schema
  vanno in una migration nuova: `pnpm db:generate`, oppure `drizzle-kit
  generate --custom` per l'SQL. Se una migration già applicata cambia, il
  container non parte e dice quale.
- **Le migration devono andare bene anche alla versione precedente.**
  Durante l'aggiornamento il vecchio container gira ancora sul database già
  migrato: si aggiunge prima, si toglie in un rilascio successivo.
- **Una migration gira in una transazione sola** (così le applica drizzle):
  niente `CREATE INDEX CONCURRENTLY` né altre istruzioni che non lo
  permettono. Se una migration diventa lenta (una tabella grande), il
  container ha circa 2 minuti per diventare sano: oltre, va alzato
  `--start-period` nel Dockerfile.
- **Le preview delle PR restano spente**, finché non avranno un loro
  database.
- **I segreti stanno solo in Coolify**, mai nel repository né al build.
- **Lo storage dei documenti** (certificati, foto delle segnalazioni) si
  sceglie con l'app web. MinIO non è più fra i servizi di Coolify e il
  progetto è archiviato da aprile 2026: le strade sono Hetzner Object
  Storage (lo stesso dei backup, in un altro bucket) o un servizio S3
  self-hosted come Garage. Il codice parla S3, quindi la scelta non lo
  cambia.
