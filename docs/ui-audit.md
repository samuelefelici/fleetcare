# Ricognizione dell'interfaccia (PR0)

Stato del codice su `main` al commit `7fb88a3`, prima del lavoro su login e
design system. Nessun file di codice è stato modificato per scrivere questo
documento. Ogni affermazione è stata ricontrollata sul codice da tre verifiche
indipendenti (accuratezza, conteggi, completezza con prove pratiche).

## 1. Esito

Si può procedere. Lo stack è **Next.js 15 (App Router) + Tailwind CSS v4** e
l'accesso è una pagina dell'app con un provider di credenziali di Auth.js:
nessuna delle due condizioni di stop del prompt è vera.

Due assunzioni del prompt non valgono e cambiano gli strumenti, non gli
obiettivi (§9): **non c'è shadcn/ui** e **non c'è una libreria di icone**.
I componenti si costruiscono sui mattoni già scritti a mano
(`apps/web/src/components/ui.tsx` e `form.tsx`), le icone sono SVG inline.

## 2. Stack e versioni

Versioni risolte nel `pnpm-lock.yaml`.

| Cosa                            | Versione                                                  | Note                                                                                          |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Node                            | 22 (`node:22-alpine` nel Dockerfile, 22 in CI; 22.22 qui) | esegue i `.ts` togliendo i tipi, senza flag (vedi §9.11)                                      |
| pnpm / Turborepo                | 10.17.0 / 2.11.7                                          | Turborepo serve in CI e per `turbo prune`; nell'immagine la build è `pnpm --filter web build` |
| Next.js                         | 15.3.9                                                    | App Router, `output: "standalone"`, server action, nessun middleware                          |
| React / React DOM               | 19.3.0                                                    |                                                                                               |
| Tailwind CSS                    | 4.3.3 (`@tailwindcss/postcss` 4.3.3)                      | configurato in CSS con `@theme`, nessun `tailwind.config`                                     |
| Auth.js (`next-auth`)           | 5.0.0-beta.29                                             | provider Credentials, sessione JWT di 12 ore                                                  |
| sonner                          | 2.0.8                                                     | i toast; unico componente di terze parti dell'interfaccia                                     |
| sharp                           | 0.34.5                                                    | dipendenza facoltativa di `next`, con i binari musl per Alpine (§9.9)                         |
| zod / drizzle-orm / postgres.js | 3.25.76 / 0.44.7 / 3.4.9                                  |                                                                                               |
| TypeScript / Vitest / Prettier  | 5.8.3 / 3.2.7 / 3.9.9                                     | strict con `noUncheckedIndexedAccess`                                                         |

Non ci sono nel progetto: shadcn/ui (`components.json`), Radix, `class-variance-authority`,
`clsx`, `tailwind-merge`, una libreria di icone, `motion` o `framer-motion`, Playwright,
axe, Lighthouse, jsdom o Testing Library. Playwright 1.56 con Chromium e `npx` sono
disponibili nell'ambiente di lavoro, non come dipendenze del progetto.

L'app è una sola (`apps/web`, versione `0.1.0` nel suo `package.json`), nello stesso
container della preparazione del database. `next.config.ts` imposta tre header di
sicurezza (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) e **nessuna CSP**: stili
inline, `blob:` e immagini dalla stessa origine passano senza modifiche.

## 3. Tema e token: dove sono oggi

Il tema è **chiaro** e i colori stanno in quattro posti.

1. **`apps/web/src/app/globals.css`**: `@theme` con cinque colori (`brand` `#f2c200`,
   `brand-ink` `#3b2f00`, `ok` `#15803d`, `warn` `#b45309`, `danger` `#b91c1c`) e il font
   di sistema (`--font-sans`); `:root { color-scheme: light }`; `body` su
   `var(--color-zinc-50)` e `var(--color-zinc-900)`; la regola `.touch` che porta a 44 px
   pulsanti, link, campi e select.
2. **`apps/web/src/components/ui.tsx`**: le stringhe di classi dei mattoni
   (`inputClass`, `buttonVariants`, `badgeTones`, i pallini di `Semaphore`), scritte con
   la tavolozza di Tailwind (`zinc`, `red`, `green`, `amber`) più i token di sopra.
3. **Nelle pagine**: classi della tavolozza scritte direttamente (`text-zinc-500`,
   `bg-white`, `border-zinc-200`…); la login ha le sue, a parte.
4. **`apps/web/src/app/layout.tsx`**: `viewport.themeColor: "#f2c200"` (senza
   `colorScheme`), `<html lang="it">` senza classi, `<body className="min-h-dvh antialiased">`,
   e il `<Toaster richColors position="top-center" />` di sonner senza `theme`, quindi
   chiaro (il default di sonner 2 è `light`).

Il tema è solo CSS: nessun provider né contesto React. I componenti client non leggono
colori da JavaScript, con un'eccezione, sonner, che riceve il tema come prop e inietta
il suo CSS a runtime (senza risorse esterne). Non ci sono favicon, icone o manifest: in
`public/` c'è solo `robots.txt`. Font: nessuno caricato, solo la pila di sistema.
Nessuna richiesta esterna a runtime.

Per il tema scuro, oltre ai token, la PR1 deve cambiare `color-scheme` in `dark` (lo
seguono 25 campi tipizzati in 8 file, le select, i selettori di data e le barre di
scorrimento), `themeColor` in `#0D0E10` con `colorScheme: "dark"` nel viewport, e mettere
le variabili di `next/font` nella `className` di `<html>`.

## 4. Componenti dell'interfaccia in uso

Usi = occorrenze di `<Nome` in `apps/web/src`, commenti esclusi.

| Componente     | File                        | Usi           | Cosa fa                                                                                                                            |
| -------------- | --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Field`        | `components/ui.tsx`         | 61            | etichetta + campo + aiuto                                                                                                          |
| `Card`         | `components/ui.tsx`         | 29            | riquadro bianco con bordo                                                                                                          |
| `PageHeader`   | `components/ui.tsx`         | 22            | titolo, sottotitolo, azioni                                                                                                        |
| `ButtonLink`   | `components/ui.tsx`         | 21            | link vestito da pulsante (`primary`, `secondary`, `danger`, `ghost`); `buttonClass()` serve anche 4 pulsanti fuori da `ButtonLink` |
| `Badge`        | `components/ui.tsx`         | 20            | etichetta colorata (`neutral`, `ok`, `warn`, `danger`, `brand`), solo testo                                                        |
| `ActionForm`   | `components/form.tsx`       | 18            | modulo per server action: errore inline, toast, redirect, `confirm` facoltativo                                                    |
| `EmptyState`   | `components/ui.tsx`         | 17            | riquadro tratteggiato con un testo                                                                                                 |
| `Details`      | `components/ui.tsx`         | 15            | coppie etichetta/valore                                                                                                            |
| `Semaphore`    | `components/ui.tsx`         | 2             | pallino colorato + testo (scadenze)                                                                                                |
| `ActionButton` | `components/form.tsx`       | 2             | pulsante senza campi, con `window.confirm`                                                                                         |
| `inputClass`   | `components/ui.tsx`         | tutti i campi | classe dei campi: `text-base` (16 px), quindi niente zoom su iOS                                                                   |
| `Toaster`      | sonner, in `app/layout.tsx` | 1             | toast in alto al centro                                                                                                            |

Componenti di sezione costruiti sui mattoni: `attrezzature/badges.tsx` (`StatusBadge`,
`MissionBadge`, `ElectromedicalBadge`), `mezzi/forbidden.tsx` e `attrezzature/forbidden.tsx`
(ruolo non abilitato), `scadenze/avvisi.tsx`, `mezzi/vehicle-fields.tsx` e
`attrezzature/equipment-fields.tsx` (campi dei moduli, `PlaceSelect`), i moduli client
(`create-form.tsx`, `modulo.tsx`, `modulo-nuova.tsx`, `elimina.tsx`,
`registra-adempimento.tsx`).

**Esiti, errori e conferme oggi.** Gli esiti delle azioni passano da tre posti:
`ActionForm` (successo come toast, errore inline in un `<p role="alert">`),
`ActionButton` (successo **ed errore** come toast), `scadenze/[id]/elimina.tsx` (successo
come toast, errore inline). Gli errori inline sono tre `<p role="alert">` con
`bg-red-50 text-danger` (`form.tsx`, `elimina.tsx`, `login/page.tsx`), più un avviso
`bg-amber-50 text-warn` nella login. Le conferme sono `window.confirm` in tre punti
(`form.tsx` due volte, `elimina.tsx`), usate da dismissione del mezzo, disattivazione
della persona, dismissione dell'attrezzatura ed eliminazione della scadenza; in
`ActionForm` la conferma è sincrona dentro `onSubmit` e il modulo resta utilizzabile
senza JavaScript grazie ad `action`.

Mancano rispetto al prompt: icone (nessun `<svg>` nell'app), skeleton, `loading.tsx`,
`error.tsx`, `Suspense`, un dialog di conferma, una tabella dati (gli elenchi sono `<ul>`
di righe-link), aggiornamenti ottimistici.

## 5. Pagine

Tutte sotto `apps/web/src/app/`. Le pagine in `(app)/` passano dal layout che verifica
la sessione sulla rubrica a ogni richiesta (`requireSession` in `server/db.ts`).

| Indirizzo                     | File                                        | Chi la vede                                | Contenuto                                                                                                           |
| ----------------------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `/`                           | `page.tsx`                                  | tutti                                      | rimanda a `/mezzi` o a `/login`                                                                                     |
| `/login`                      | `login/page.tsx`                            | non autenticati                            | accesso (§6)                                                                                                        |
| `/uscita`                     | `uscita/route.ts`                           | —                                          | route handler: cancella la sessione di chi è stato disattivato                                                      |
| `/mezzi`                      | `(app)/mezzi/page.tsx`                      | tutti                                      | elenco del parco, `?mostra=tutti` per i dismessi                                                                    |
| `/mezzi/nuovo`                | `(app)/mezzi/nuovo/page.tsx`                | direzione, resp. parco mezzi               | anagrafica nuova                                                                                                    |
| `/mezzi/[id]`                 | `(app)/mezzi/[id]/page.tsx`                 | tutti (moduli per ruolo)                   | scheda, letture km, stato, dismissione                                                                              |
| `/mezzi/[id]/modifica`        | `(app)/mezzi/[id]/modifica/page.tsx`        | direzione, resp. parco mezzi               | anagrafica                                                                                                          |
| `/scadenze`                   | `(app)/scadenze/page.tsx`                   | tutti                                      | scadenzario per urgenza, `?stato=`, `?mezzo=`, `?attrezzatura=`                                                     |
| `/scadenze/[id]`              | `(app)/scadenze/[id]/page.tsx`              | tutti (moduli per ruolo)                   | scheda, storico, quattro moduli                                                                                     |
| `/scadenze/nuova`             | `(app)/scadenze/nuova/page.tsx`             | direzione, resp. mezzi e materiale         | scadenza fuori catalogo                                                                                             |
| `/attrezzature`               | `(app)/attrezzature/page.tsx`               | tutti                                      | elenco, `?mezzo=`, `?sede=`, `?tipo=`, `?stato=`, `?mostra=tutti`                                                   |
| `/attrezzature/nuova`         | `(app)/attrezzature/nuova/page.tsx`         | direzione, resp. mezzi e materiale         |                                                                                                                     |
| `/attrezzature/[id]`          | `(app)/attrezzature/[id]/page.tsx`          | tutti (moduli per ruolo)                   | scheda, «Sposta», stato, storico                                                                                    |
| `/attrezzature/[id]/modifica` | `(app)/attrezzature/[id]/modifica/page.tsx` | direzione, resp. mezzi e materiale         |                                                                                                                     |
| `/attrezzature/tipi`          | `(app)/attrezzature/tipi/page.tsx`          | tutti                                      | catalogo dei tipi                                                                                                   |
| `/persone`                    | `(app)/persone/page.tsx`                    | tutti (nel menu tutti tranne l'equipaggio) | rubrica, `?mostra=tutti` per le disattivate                                                                         |
| `/persone/nuova`              | `(app)/persone/nuova/page.tsx`              | direzione                                  | persona e utenza                                                                                                    |
| `/persone/[id]`               | `(app)/persone/[id]/page.tsx`               | tutti (moduli per ruolo)                   | scheda, utenza, attivazione                                                                                         |
| `/profilo`                    | `(app)/profilo/page.tsx`                    | tutti                                      | i propri dati, telefono, password                                                                                   |
| non trovata                   | `not-found.tsx`, `(app)/not-found.tsx`      | —                                          | in italiano; quella dentro l'app ha i link a Mezzi, Scadenze, Attrezzature, quella fuori un solo link «Vai all'app» |
| `/api/health`, `/api/auth/*`  | `api/…/route.ts`                            | —                                          | autocontrollo del container, Auth.js                                                                                |

Non esistono: dashboard, ricerca globale, notifiche, recupero della password.

**Il guscio** (`(app)/layout.tsx`): barra laterale di 256 px su desktop, barra in alto che
va a capo sul telefono; voci Mezzi, Scadenze, Attrezzature, Persone (non per
l'equipaggio), Il mio profilo; in fondo nome, ruolo ed «Esci». La voce attiva **non** è
segnata (`aria-current` c'è solo nei filtri di `/scadenze`, `usePathname` non si usa).
«Esci» è una server action dichiarata dentro il layout: si sposta così com'è, senza
riscriverla. Il layout è già dinamico (legge la sessione a ogni richiesta), quindi leggere
un cookie con `cookies()` non cambia il rendering. La classe `.touch` impone 44 px a ogni
link e pulsante: con la barra a 64 px le icone stanno in bersagli di 44 px.

## 6. Flusso di accesso

- **Pagina**: `login/page.tsx`, componente server con `dynamic = "force-dynamic"`; se la
  sessione c'è già rimanda a `/`. Il modulo è HTML puro che invia a una server action:
  **funziona senza JavaScript**.
- **Campi**: `email` (`type="email"`, `autocomplete="username"`), `password`
  (`autocomplete="current-password"`), e `tenant` (select «Associazione») **solo** quando
  la stessa email sta in più associazioni. Pulsante «Entra».
- **Azione**: `login/actions.ts` → `findLoginAccounts` (`server/auth.ts`, funzione SQL
  `auth_find_accounts`, verifica scrypt). Campi vuoti o zero risultati: `?error=1`; più di
  uno: `?scegli=<base64url>` (`login/choices.ts`) e si rimette la password; uno: `signIn`
  di Auth.js con `redirectTo: "/"`. Se `signIn` fallisce (`AuthError`), anche questo
  diventa `?error=1`.
- **Messaggi** dall'indirizzo: in pratica arrivano solo `?error=1` (da `login/actions.ts`)
  e `?error=disattivata` (da `requireSession` → `/uscita?motivo=disattivata` → `signOut`).
  La pagina distingue solo `disattivata` («La tua utenza è stata disattivata: chiedi alla
  direzione.»); ogni altro valore mostra «Email o password non giuste. Riprova.»,
  compreso `CredentialsSignin`, che Auth.js manda solo a chi chiama direttamente
  `/api/auth/callback/credentials`. Con `?scegli=` compare l'avviso «Sei in più di
  un'associazione: scegli quale, e rimetti la password.»; `?email=` ripropone l'email.
- **Sessione**: JWT di 12 ore con id, associazione, ruolo; ruolo e attivazione si
  rileggono dalla rubrica a ogni richiesta.
- **Prima dell'associazione**: la login non sa ancora l'associazione (la sceglie
  l'email), coerente con D4.
- **Test**: nessun test sulla pagina o sull'azione di login. In CI c'è la parte dati
  (`rls.test.sql` prova `auth_find_accounts`, `password.test.ts` la verifica scrypt) e il
  controllo che `/login` risponda 200 dall'immagine Docker. Le prove nel browser fatte
  finora stanno fuori dal repo.

## 7. Stati nel modello dati e mappa sui quattro toni

Gli stati vengono dagli enum di `packages/db/src/schema/enums.ts` e dal motore delle
scadenze (`packages/db/src/domain/deadlines.ts`). Nessuno stato nuovo: si cambia solo il
tono con cui si mostrano. «Oggi» è il tono attuale (`Badge`/`Semaphore`), «Proposto» è
quello nuovo.

**Mezzo** (`vehicle_status`, etichette in `domain/labels.ts`, toni in `mezzi/labels.ts`)

| Valore           | Etichetta   | Oggi           | Proposto     | Perché                                                  |
| ---------------- | ----------- | -------------- | ------------ | ------------------------------------------------------- |
| `operational`    | Operativo   | ok             | **ok**       |                                                         |
| `reserve`        | Riserva     | brand (giallo) | **ok**       | è usabile; il colore del brand non si usa per gli stati |
| `maintenance`    | In officina | warn           | **warn**     | non disponibile ma previsto: attenzione                 |
| `grounded`       | Fermo       | danger         | **critical** | scadenza bloccante superata o difetto di sicurezza      |
| `decommissioned` | Dismesso    | neutral        | **idle**     |                                                         |

**Attrezzatura** (`equipment_status`, toni in `attrezzature/labels.ts`)

| Valore           | Etichetta     | Oggi    | Proposto         |
| ---------------- | ------------- | ------- | ---------------- |
| `in_use`         | In uso        | ok      | **ok**           |
| `in_stock`       | Di scorta     | brand   | **ok** (usabile) |
| `in_repair`      | In assistenza | warn    | **warn**         |
| `out_of_service` | Fuori uso     | danger  | **critical**     |
| `disposed`       | Dismessa      | neutral | **idle**         |

**Scadenza** (`DeadlineState` del motore, etichette in `scadenze/logica.ts`)

| Stato      | Etichetta                                                                                                                          | Oggi                                       | Proposto             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------- |
| `ok`       | In regola                                                                                                                          | verde                                      | **ok**               |
| `expiring` | In scadenza (dentro il preavviso in giorni o km)                                                                                   | giallo                                     | **warn**             |
| `expired`  | Scaduta                                                                                                                            | rosso solo se bloccante, altrimenti giallo | **critical**, sempre |
| `missing`  | Da completare (nessuna data, e km assenti o non valutabili perché manca il contachilometri: sempre per le attrezzature senza data) | giallo                                     | **warn** (vedi §10)  |
| archiviata | —                                                                                                                                  | grigio, solo nella scheda                  | **idle**             |

Oggi il colore di ogni riga viene da `semaphore()` applicato a **una sola** scadenza
(`evaluateRows` in `scadenze/logica.ts` per l'elenco, `scadenze/[id]/page.tsx` per la
scheda): per questo una scaduta non bloccante è gialla. Il grigio dell'archiviata lo
mette la scheda (`archived ? "grey" : color`); l'elenco non mostra le archiviate.
Nell'app non c'è un semaforo riassuntivo per mezzo. La mappa proposta usa lo stato
(`evaluation.state`): nella PR7 si cambiano quei due punti, mentre `semaphore()` in
`packages/db` resta com'è.

**Altro**

| Dove                                                                    | Valore                             | Oggi               | Proposto                                         |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------ | ------------------------------------------------ |
| Esito di un adempimento (`completion_outcome`)                          | Fatto / Con riserva / Non superato | ok / warn / danger | **ok / warn / critical**                         |
| Persona (elenco e scheda)                                               | Attiva / Disattivata               | ok / danger        | **ok / idle**                                    |
| Badge «Blocca il mezzo» / «Blocca l'attrezzatura»                       | scaduta / non scaduta              | danger / neutral   | **critical** / neutro                            |
| Badge «Mezzo dismesso» / «Attrezzatura dismessa»                        | —                                  | neutral            | **idle**                                         |
| Badge «indispensabile» (tipo `mission_critical`)                        | proprietà del tipo                 | danger             | neutro con icona: è una proprietà, non uno stato |
| Badge «tu», «sei tu», «Corretta a mano»                                 | —                                  | brand              | neutro                                           |
| Badge «La chiude l'equipaggio», «Serve il documento», «elettromedicale» | —                                  | neutral            | neutro                                           |
| Tipo «non attivo»                                                       | —                                  | warn               | **idle**                                         |

Nel modello ci sono anche stati di sezioni che l'app non mostra ancora (segnalazioni
guasti con `fault_severity` verde/giallo/rosso, interventi, fatture carburante): non
servono per questo lavoro.

## 8. Colori scritti a mano, per file

Conteggio fatto da uno script sui file di `apps/web/src` (commenti esclusi) e rifatto in
modo indipendente con un metodo diverso: i numeri coincidono. «Tavolozza» sono le classi
Tailwind della tavolozza (`bg-zinc-50`, `text-red-800`, `bg-white`, anche con `hover:` e
opacità) e i `var(--color-zinc-…)`; «token» sono le classi dei cinque token di oggi
(`brand`, `brand-ink`, `ok`, `warn`, `danger`), che non sono hardcoded ma andranno
rinominate. Nessun `rgb()`/`hsl()`, nessun valore arbitrario `[#…]`, nessuna classe
costruita al volo.

| File                                   |   Hex | Tavolozza | Token di oggi |
| -------------------------------------- | ----: | --------: | ------------: |
| `components/ui.tsx`                    |     0 |        31 |            11 |
| `app/(app)/scadenze/[id]/page.tsx`     |     0 |        21 |             0 |
| `app/(app)/mezzi/[id]/page.tsx`        |     0 |        17 |             0 |
| `app/(app)/attrezzature/[id]/page.tsx` |     0 |        15 |             0 |
| `app/(app)/scadenze/page.tsx`          |     0 |        13 |             3 |
| `app/(app)/persone/page.tsx`           |     0 |        11 |             0 |
| `app/login/page.tsx`                   |     0 |        10 |            10 |
| `app/(app)/layout.tsx`                 |     0 |         9 |             2 |
| `app/globals.css`                      |     5 |         2 |             0 |
| `app/(app)/mezzi/page.tsx`             |     0 |         7 |             0 |
| `app/(app)/attrezzature/tipi/page.tsx` |     0 |         7 |             0 |
| `app/(app)/attrezzature/page.tsx`      |     0 |         6 |             0 |
| `app/(app)/persone/[id]/page.tsx`      |     0 |         5 |             1 |
| `app/(app)/mezzi/vehicle-fields.tsx`   |     0 |         3 |             1 |
| `app/(app)/persone/nuova/modulo.tsx`   |     0 |         3 |             1 |
| `app/(app)/scadenze/[id]/elimina.tsx`  |     0 |         2 |             1 |
| `components/form.tsx`                  |     0 |         1 |             1 |
| `app/layout.tsx`                       |     1 |         0 |             0 |
| `app/not-found.tsx`                    |     0 |         1 |             0 |
| `app/(app)/scadenze/avvisi.tsx`        |     0 |         1 |             0 |
| `app/(app)/profilo/page.tsx`           |     0 |         1 |             0 |
| **Totale (21 file)**                   | **6** |   **166** |        **31** |

Le classi più frequenti: `text-zinc-500` (54), `text-zinc-600` (18), `border-zinc-200`
(14), `bg-white` (14), `divide-zinc-200` (8). Neutri (`zinc`, `white`): 148 su 166. Gli
altri 18 sono i fondi pastello e i loro testi: `bg-red-50/100`, `bg-green-50/100`,
`bg-amber-50/100`, `text-red-800`, `text-green-800/900`, `text-amber-800`,
`border-red-300`, `bg-amber-400` (l'hover del pulsante primario, in `ui.tsx` e nella login)
e un `bg-zinc-400`. Il passaggio al tema scuro è soprattutto una rimappa dei neutri.

## 9. Scostamenti dal prompt e come li tratto

1. **Niente shadcn**: i token si chiamano come nel prompt (`--bg-base`, `--accent`…) e si
   espongono a Tailwind con `@theme inline` (`bg-bg-base`, `text-accent`…). Non c'è un
   sistema parallelo da evitare, perché non ce n'è uno da riusare. I componenti della
   PR2 nascono da `ui.tsx` e `form.tsx`; il dialog di conferma usa `<dialog>` nativo e
   sostituisce `window.confirm` nei tre punti del §4, con la conferma resa asincrona in
   `ActionForm` e `action` mantenuto per il funzionamento senza JavaScript.
2. **Niente icone**: un file `components/icons.tsx` con poche icone SVG inline, quante ne
   chiedono stati e guscio. Nessuna dipendenza.
3. **Tema chiaro e 166 classi della tavolozza**: con i soli token nuovi la PR1 lascerebbe
   riquadri bianchi su fondo scuro. Propongo un **ponte** per la PR1 (§10, punto 2),
   provato su Tailwind 4.3.3: le classi della tavolozza, anche con `hover:` e con
   l'opacità (`bg-brand/20` diventa `color-mix(…)`), prendono il valore ridefinito.
4. **Font**: `next/font/google` scarica i file da Google durante la build, quindi la build
   dipenderebbe da Google (e dietro un proxy fallisce). Uso `next/font/local` con i file
   dei pacchetti `@fontsource` (le uniche dipendenze nuove ammesse): niente richieste
   esterne né a build né a runtime, e `next/font` calcola il fallback metrico
   (`size-adjust`, `ascent-override`…), che toglie il salto del testo al caricamento.
   Provato su Next 15.3.9 con un pacchetto collegato da symlink come fa pnpm. In `src` va
   un percorso **relativo al file** che chiama `localFont` (da `src/app/layout.tsx`:
   `../../node_modules/@fontsource/<font>/files/<font>-latin-<peso>-normal.woff2`): un nome
   di pacchetto nudo non viene risolto. Solo i pesi usati, subset `latin` e `latin-ext`.
   I pacchetti vanno nelle `dependencies` di `apps/web` e il lockfile va aggiornato (CI e
   Dockerfile usano `--frozen-lockfile`).
5. **`NEXT_PUBLIC_LOGIN_HERO`**: una variabile `NEXT_PUBLIC_` finisce nel codice al momento
   della build. Nell'immagine la build è `pnpm --filter web build`, senza Turborepo, e il
   Dockerfile oggi non dichiara `ARG` per le variabili dell'app (solo `NODE_IMAGE`;
   `SKIP_ENV_VALIDATION` è un `ENV` fisso). La PR5 aggiunge `ARG NEXT_PUBLIC_LOGIN_HERO`
   (con l'`ENV` corrispondente) nello stage `builder`, prima di `RUN pnpm --filter web
build`. In CI Turborepo la lascia già passare: per un'app Next deduce `NEXT_PUBLIC_*`
   anche in modalità strict, quindi la voce in `turbo.json` è facoltativa. Il valore di
   default, se la variabile manca, è `animated`: su Coolify non serve niente finché non si
   vuole il ripiego; per usarlo la variabile va spuntata come «Build Variable», poi si
   rifà il deploy.
6. **Screenshot nelle PR**: la descrizione di una PR non può caricare immagini da qui. Li
   metto nel repo in `docs/ui/screenshots/<pr>/` e la descrizione li linka.
7. **Misure (Lighthouse, CLS, long task, axe)**: nessuno di questi strumenti è nel
   progetto. Le misure si fanno con Playwright e Chromium dell'ambiente di lavoro, e con
   Lighthouse lanciato con `npx`, senza aggiungerli alle dipendenze; i numeri vanno nella
   descrizione della PR.
8. **Stato della barra laterale**: va salvato in un cookie letto dal layout server, non in
   `localStorage`: altrimenti la barra si apre e poi si chiude dopo l'idratazione, ed è un
   salto di layout.
9. **Immagini della hero con `next/image`**: `sharp` 0.34.5 è nel lockfile come dipendenza
   facoltativa di `next`, con i binari musl per Alpine; lo standalone lo include (Next lo
   esclude dal tracciamento solo su Vercel). Nella PR4 basta una prova di fumo nel
   container: `/_next/image?url=…&w=1080&q=75` deve rispondere 200 con `image/webp`. Per
   servire anche AVIF serve `images: { formats: ["image/avif", "image/webp"] }` in
   `next.config.ts`, perché il default è solo WebP.
10. **Cosa arriva in produzione**: il Dockerfile copia lo standalone, `.next/static` (dove
    finiscono CSS, chunk, i font di `next/font` e il codice della hero importata
    dinamicamente) e `public/`. Gli asset della PR6 in `apps/web/public/login/` arrivano
    in produzione senza toccare il Dockerfile; l'unica modifica al Dockerfile è l'`ARG`
    della PR5.
11. **Script di contrasto**: Node 22 toglie solo i tipi. Lo script deve essere un file
    unico, senza `enum`, `namespace` o proprietà nei parametri del costruttore, senza
    import relativi né alias `@/` (solo `node:fs` e `node:path`, e legge i valori da
    `globals.css` come testo): un import `./x.ts` girerebbe con Node ma romperebbe
    `pnpm typecheck` (TS5097), perché `apps/web/tsconfig.json` include tutti i `.ts`.
    Va eseguito in CI come passo dedicato e aggiunto al `lint` di `apps/web` (oggi
    Prettier controlla solo `src`, `tests` e `vitest.config.ts`).
12. **Test del motore a scene**: `vitest.config.ts` cerca `tests/**/*.test.ts` in ambiente
    node, senza DOM, e non si possono aggiungere jsdom o Testing Library. La logica pura
    (dimensioni e scostamento dello stage, `fitLabel`, timeline, scelta della scena,
    lettura del flag, `prefers-reduced-motion` passato come parametro) va separata dal
    componente React e provata così. La CI si rompe se i file nuovi non passano Prettier,
    se il lockfile non è aggiornato dopo i font, o se `/login` smette di rispondere 200
    nell'immagine (per esempio se la hero lancia un errore sul server).
13. **Dashboard e card KPI**: la dashboard non esiste e il prompt chiede di restilizzare
    solo le pagine che ci sono; l'accento HUD resta solo nell'intestazione della scheda
    mezzo. Allo stesso modo la topbar avrà associazione e menu utente, senza ricerca né
    notifiche, e la login niente «Password dimenticata?».

## 10. Decisioni aperte, con la mia raccomandazione

| #   | Decisione                            | Raccomandazione                                                                                                       | Perché                                                                                                               |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Tono di una scadenza «Da completare» | **warn**                                                                                                              | serve un'azione (scrivere la data dal documento) e oggi è già gialla; `idle` la farebbe sembrare a posto             |
| 2   | Ponte della PR1 per il tema scuro    | **ridefinire in `@theme inline` l'intera scala usata dalle pagine come alias dei token scuri, e toglierla nella PR7** | le pagine diventano scure e coerenti subito, senza toccarle, e il ponte sta in un file solo: si revoca con un revert |
| 3   | «Riserva» e «Di scorta»              | **ok**                                                                                                                | sono usabili; oggi usano il giallo del brand, che il prompt riserva alle azioni                                      |
| 4   | Badge «indispensabile»               | **neutro con icona**                                                                                                  | è una proprietà del tipo, non uno stato: in rosso si confonde con «Fuori uso»                                        |
| 5   | Font                                 | **`next/font/local` sui file `@fontsource`**                                                                          | §9.4                                                                                                                 |
| 6   | `NEXT_PUBLIC_LOGIN_HERO`             | **variabile di build con `ARG` nello stage `builder`, default `animated`; `turbo.json` facoltativo**                  | rispetta nome e ripiego del prompt senza cambiare niente su Coolify finché non serve                                 |

Dettaglio del punto 2, perché è quello che decide come appare l'app dopo la PR1:

- **`@theme inline`, non `@theme`**: con `@theme` semplice l'alias si risolve su `:root`, e
  un tema chiaro definito più in basso nel DOM non arriverebbe alle classi; con `inline`
  le classi puntano direttamente ai token.
- **Neutri**: `zinc-50/100` → fondi; `white` → superfici; `zinc-200/300/400` → bordi e
  `idle`; `zinc-500…900` → testi secondari e primari. Vanno tutti schiariti: sul fondo
  `#0D0E10` lo `zinc-500` di oggi fa 4,00:1 e lo `zinc-600` 2,50:1.
- **Pastelli**: `bg-red-50/100`, `bg-green-50/100`, `bg-amber-50/100` → tinte scure di
  `critical`, `ok`, `warn`; i loro testi (`text-red-800`, `text-green-800/900`,
  `text-amber-800`, `border-red-300`) → le varianti chiare; `bg-amber-400` → l'accento
  schiarito.
- **I cinque token di oggi**: `--color-danger`, `--color-ok`, `--color-warn` diventano
  alias di `critical`, `ok`, `warn` (oggi `text-danger` fa 2,98:1 sul fondo scuro);
  `--color-brand` → `--accent`, `--color-brand-ink` → `--on-accent`.
- **Opacità**: `bg-brand/20` e `ring-brand/40` passano da `color-mix()`, che Tailwind v4
  richiede comunque (Safari 16.4, Chrome 111, Firefox 128).
