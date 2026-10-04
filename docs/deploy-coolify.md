# FleetCare su Coolify, passo per passo

Per **Coolify 4.3.23**. Si fa in questo ordine, una volta sola. Ogni passo
ha un **controllo**: se non torna, non si va avanti. I passi segnati ⚠️
non si possono annullare.

Il perché delle scelte è in fondo (§7). Il ripristino da backup è al §6.

---

## 1. Due password

Dal tuo PC:

```bash
openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32; echo
```

Lancialo due volte e conserva i due risultati:

- **password A** → per l'utente `postgres` del database;
- **password B** → per l'utente `fleetcare_app` dell'applicazione.

Solo lettere e cifre: finiscono dentro un indirizzo e non devono avere
simboli.

## 2. Il bucket per i backup (Hetzner)

I backup del database devono stare **fuori dal server**. Su Hetzner si usa
*Object Storage* (la Storage Box non va bene: non parla S3). Ha un canone
mensile fisso: lo vedi in console prima di confermare.

1. Cloud Console di Hetzner → il tuo progetto → menu a sinistra **Object
   Storage** → **Create Bucket**.
2. **Location**: `fsn1` (Falkenstein) o `nbg1` (Norimberga). **Name**:
   `fleetcare-backup`. **Visibility**: **private**. Conferma.
3. Le chiavi: nella pagina dell'Object Storage, **Manage credentials** →
   descrizione `coolify` → **Generate credentials**. Copia subito **Access
   key** e **Secret key**: la secret si vede una volta sola.

**Controllo**: il bucket è nella lista, privato. Segnati l'endpoint, che
dipende dalla location: `https://fsn1.your-objectstorage.com` (o `nbg1`).

Fonte: la guida Hetzner [Creating a Bucket](https://docs.hetzner.com/storage/object-storage/getting-started/creating-a-bucket/).

## 3. Il database

Coolify → **Projects** → **+ Add** → nome `FleetCare` (ambiente
`production`). Entra nel progetto.

**+ New** → **Databases** → **PostgreSQL** → scegli la scheda
**PostgreSQL 17** ⚠️ (immagine `postgres:17-alpine`). Non PostgreSQL 18 e
non PostGIS. La versione si sceglie adesso: cambiarla dopo sposta i dati
in un posto dove il database non li trova più.

Nella pagina del database:

- **Name**: `fleetcare-db`
- **Initial Database**: `fleetcare`
- **Username**: `postgres` · **Password**: la **password A**
- Sezione **Public access** → **Access**: **Private**. Resta privato: una
  porta pubblica scavalca anche il firewall del server.

**Start**.

**Controllo**: stato *Running*. Copia il campo **Postgres URL (internal)**:
è fatto così
`postgres://postgres:<password A>@<codice>:5432/fleetcare`. Il `<codice>`
è l'indirizzo interno del database: ti serve al §5.

## 4. I backup

1. In alto, **Settings** (icona ingranaggio) → **S3 Storages** → **+ Add**:
   - **Name**: `hetzner-backup`
   - **Endpoint**: `https://fsn1.your-objectstorage.com` (la tua location)
   - **Bucket**: `fleetcare-backup` · **Region**: `fsn1`
   - **Access Key** / **Secret Key**: quelle del §2
   - **Validate**, poi salva.
2. Torna a `fleetcare-db` → scheda **Backups** → **+ Add** (Scheduled
   Backups):
   - **Frequency**: `30 0 * * *` (ogni notte; l'ora è quella del server,
     di solito UTC)
   - **Database selection**: *Specific databases* → `fleetcare`
   - **Enable S3** → **S3 storage**: `hetzner-backup` → **Local copy**:
     *Delete after S3 upload*
   - **Backups to keep**: `7` · **Days to keep**: `30` ⚠️ (il valore di
     partenza è 0 = per sempre: lo spazio si riempie)
   - salva.
3. **Backup Now**.

**Controllo**: nella lista il backup è *Success* e nel bucket, su Hetzner,
c'è il file `.dmp`.

## 5. L'applicazione

Nel progetto: **+ New** → **Private Repository (with GitHub App)** →
`samuelefelici/fleetcare` → **Branch** `main` → **Build Pack**
**Dockerfile** → **Continue**.

Nella pagina dell'applicazione, scheda **General**:

- **Name**: `fleetcare`
- **Base Directory**: `/` · **Dockerfile Location**: `/Dockerfile`
- **Ports Exposes**: `3000`
- **Domains**: vuoto per ora (oggi risponde solo l'healthcheck; il dominio
  si mette con l'app web)
- **Pre-deployment** e **Post-deployment Command**: vuoti
- **Docker build stage target**: vuoto

Scheda **Healthcheck**: lasciala **disattivata**. Coolify usa quello
scritto nel Dockerfile.

Scheda **Environment Variables** → aggiungi queste, e per **ognuna** metti
**Build time: Not available during build** ⚠️ (Coolify le crea
disponibili al build, e finirebbero dentro l'immagine). **Runtime** resta
*Available in the container*.

| Nome | Valore |
|---|---|
| `DATABASE_ADMIN_URL` | il *Postgres URL (internal)* copiato al §3, intero |
| `DATABASE_URL` | `postgres://fleetcare_app:<password B>@<codice>:5432/fleetcare` (lo stesso `<codice>` del §3) |
| `SEED_TENANT_SLUG` | `croce-gialla-camerano` |
| `SEED_TENANT_NAME` | `Croce Gialla di Camerano` |
| `SEED_TENANT_NETWORK` | `ANPAS` |
| `SEED_TENANT_CITY` | `Camerano` |
| `SEED_TENANT_PROVINCE` | `AN` |

Niente `NODE_ENV`: è già nel Dockerfile. Niente preview delle PR (scheda
**Advanced**, lascia spento *Preview Deployments*): una preview userebbe
il database di produzione.

**Deploy**.

**Controllo**, in due posti:

- nel **log del deploy**: `Custom healthcheck found in Dockerfile` e `New
  container is healthy`;
- nella scheda **Logs** dell'applicazione:

```
[fleetcare] migration: 2 applicate (2 adesso: 0000_init, 0001_rls_and_functions)
[fleetcare] ruolo applicativo: password impostata da DATABASE_URL
[fleetcare] ruolo applicativo: permessi riapplicati, niente superutente né TEMP
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

Se una riga dice `NO`, il container non parte e il messaggio dice cosa
manca. L'errore più facile da fare: `DATABASE_URL` scritto con l'utente
`postgres` invece di `fleetcare_app`. Il container lo rifiuta, perché così
l'app vedrebbe tutto di tutti.

Fatto. Da qui ogni push su `main` ricostruisce l'immagine e la mette in
linea solo se passa l'autocontrollo; altrimenti resta quella di prima.

---

## 6. Ripristinare un backup

**Regola unica: si ripristina sempre in un database nuovo**, mai sopra
quello in uso. Così un ripristino sbagliato non cancella niente.

1. Crea una risorsa PostgreSQL nuova come al §3 (**PostgreSQL 17**,
   database `fleetcare`, stessa password A va bene) e configura i backup
   come al §4.
2. Dal suo **Terminal** (scheda Terminal della risorsa):
   ```bash
   psql -U postgres -d fleetcare -c "create role fleetcare_app login"
   ```
   Il backup non contiene il ruolo, e senza il ruolo il ripristino
   fallisce. La password gliela rimette l'app al primo avvio.
3. Scheda **Import Backup**: *Restore from S3* → lo storage e il file
   `.dmp`. Nel campo **Import command** sostituisci il comando con:
   ```bash
   pg_restore --exit-on-error --single-transaction --no-owner --no-acl --clean --if-exists -U $POSTGRES_USER -d ${POSTGRES_DB:-postgres}
   ```
   (così, se qualcosa va storto, non resta un ripristino a metà). Avvia.
4. Sull'applicazione: `DATABASE_ADMIN_URL` = il *Postgres URL (internal)*
   della risorsa nuova, intero; in `DATABASE_URL` cambia solo il `<codice>`
   dell'host. **Redeploy**.
5. Quando tutto torna, spegni i backup della risorsa vecchia (o eliminala).

**Controllo**: nella scheda Logs l'autocontrollo è tutto `ok`, e i dati ci
sono.

**Prova del ripristino** (da fare una volta, subito dopo il §5, prima che
ci siano dati veri): passi 1-3 su una risorsa `fleetcare-prova`, poi dal
suo Terminal `psql -U postgres -d fleetcare -c "select count(*) from
fleetcare.deadline_types"` deve dare 15. Poi elimina `fleetcare-prova`.
L'applicazione non si tocca.

## 7. Cose da sapere

- **Cambiare la password B**: cambia `DATABASE_URL` e fai **Redeploy**,
  nient'altro in quel deploy. Il container nuovo imposta la password nuova
  nel database. Se quel deploy fallisse, rimetti subito il valore vecchio
  e rifai Redeploy, altrimenti il container rimasto in linea perde
  l'accesso al database entro un'ora.
- **Una migration applicata in produzione non si modifica più**: le
  modifiche allo schema vanno in una migration nuova (`pnpm db:generate`).
  Se una già applicata cambia, il container non parte e dice quale, senza
  toccare il database.
- **Perché un Dockerfile e non Docker Compose**: con il Dockerfile Coolify
  avvia il container nuovo accanto al vecchio e lo sostituisce solo se
  risponde all'healthcheck; con le compose ferma tutto e riavvia. E un
  database dentro una compose collegata a GitHub non ha i backup
  schedulati.
- **Perché `postgres:17-alpine` e non PostGIS**: FleetCare non ha dati
  spaziali, e con l'immagine PostGIS il ripristino di un backup in un
  database nuovo fallisce (crea da sola uno schema che il backup contiene
  già).
- **Dove girano le migration**: all'avvio del container, non nei comandi
  di pre/post-deployment di Coolify. Il pre-deployment gira sul codice
  vecchio; il post-deployment quando il traffico è già passato, e un suo
  errore non ferma il deploy.
- **Lo storage dei documenti** (certificati, foto) si sceglie con l'app
  web: un secondo bucket sullo stesso Object Storage di Hetzner è la strada
  più semplice. MinIO non è più fra i servizi di Coolify.
