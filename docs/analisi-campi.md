# FleetCare — analisi dei campi e dello schema

Gestione del parco mezzi di un'associazione di soccorso (Croce Gialla di
Camerano come primo caso: circa 20 mezzi tra ambulanze, automediche e
pulmini per disabili). Questo documento spiega **quali dati servono e
perché**, cosa è stato preso dal gestionale TPL (`fleetmanagement`), cosa è
stato tolto e cosa è nuovo. Lo schema vero sta in
[`packages/db/src/schema`](../packages/db/src/schema): ogni tabella ha un
commento che riprende queste ragioni.

---

## 1. Le scelte di fondo

**Il problema non è quello di un'azienda TPL.** Il gestionale TPL è
costruito intorno a un'officina interna (meccanici, ore, fosse, magazzino
ricambi), a 120 bus e alla copia di un gestionale esistente. La Croce
Gialla ha un problema diverso:

1. **Il lavoro sui mezzi lo fanno fornitori esterni** (concessionaria,
   gommista, carrozzeria, allestitore). L'unità reale di un intervento è la
   fattura dell'officina, non una commessa con righe di manodopera.
2. **Le scadenze contano più della manutenzione**, e non sono solo del
   mezzo. Un'ambulanza può essere in regola con revisione e RCA e non poter
   uscire comunque, perché gli elettrodi del DAE sono scaduti o la bombola
   dell'ossigeno è fuori collaudo. Ogni attrezzatura ha le sue scadenze, e
   queste viaggiano con l'oggetto quando passa da un mezzo all'altro.
3. **Il controllo del mezzo lo fa l'equipaggio a inizio turno**, ed è
   documentazione: chi ha controllato cosa, quando.
4. **Il carburante arriva da un solo distributore con fattura mensile.** Il
   controllo che serve è il confronto fra ciò che l'equipaggio dichiara alla
   pompa e ciò che il distributore fattura.

Da qui tre decisioni strutturali:

| Decisione | Perché |
|---|---|
| **Un solo motore di scadenze** per mezzi e attrezzature (`deadline_types` → `deadline_rules` → `deadlines` → `deadline_completions`) | Revisione, RCA, tagliando, verifica elettrica del DAE, collaudo della bombola sono la stessa cosa: una data (o dei km) entro cui fare qualcosa, un preavviso, un sì/no sul blocco. Tenerle insieme dà una sola domanda per il semaforo: «cosa scade nei prossimi 30 giorni, ovunque». |
| **Multi-tenant con RLS da subito**, anche se oggi l'associazione è una | Aggiungere `tenant_id` dopo, con i dati dentro, costa molto più che averlo adesso. Il costo oggi è una colonna e una policy per tabella. |
| **Database dedicato**, schema Postgres `fleetcare` | Nel database di Cerbero lo schema `fleetcare` esiste già ed è del modulo TPL. Il nome dello schema resta comunque una protezione a costo zero. |

---

## 2. Cosa viene dal gestionale TPL, cosa no

| `fleetmanagement` (TPL) | `fleetcare` | Perché |
|---|---|---|
| `tenants`, `profiles`, `notifications`, `audit_logs`, `document_counters` | **tenute** | La base è la stessa; `tenants` guadagna i dati dell'ente (CF, RUNTS, rete ANPAS/CRI/Misericordie, PEC). |
| ruoli `driver`, `mechanic`, `workshop_manager`, `admin_finance`, `fleet_admin` | `crew`, `fleet_manager`, `equipment_manager`, `admin_finance`, `admin` | Niente meccanici interni. Serve invece il **responsabile del materiale sanitario**, che in un'associazione è una figura distinta dal responsabile mezzi. |
| `depots` | `sites` | Sede e postazioni. |
| `vehicles` + `vehicle_fleet_profiles` (1:1, ~70 colonne) | `vehicles`, una tabella | La separazione serviva perché altri moduli Cerbero leggevano i mezzi; qui non c'è un secondo modulo. Escono i campi TPL (posti in piedi, pedana PEM/PEA, consumi di riferimento, transponder metano, classe di manutenzione legacy…). Entrano allestimento sanitario, sigla radio, provenienza (donazione, 5×1000), esenzione bollo, massa complessiva. |
| `vehicle_deadlines` (enum chiuso `deadline_kind`) + `legacy_deadline_types` | `deadline_types`, `deadline_rules`, `deadlines`, `deadline_completions` | L'enum chiuso diventa un catalogo che l'associazione estende; le scadenze valgono anche per le attrezzature; lo storico degli adempimenti (con costo, fornitore, certificato) diventa una tabella invece di stare solo nell'audit log. |
| `maintenance_plan_tasks`, `maintenance_log`, `maintenance_due` | il tipo di scadenza `tagliando` (tempo **e** km) | Per una ventina di mezzi il piano di manutenzione è una o due voci per mezzo: il motore delle scadenze lo regge già, con «vale il primo raggiunto». |
| `work_orders` + righe, manodopera, ricambi, tassonomia VMRS, `failure_codes`, `work_codes` | `maintenance_jobs` | Lavoro esterno: un intervento = un mezzo (o un'attrezzatura), un fornitore, entrata/uscita, cosa è stato fatto, la fattura. Se servirà il dettaglio a righe si aggiunge una tabella senza toccare questa. |
| `reports` + media + commenti + zone SVG | `fault_reports` + `attachments` | Stesso principio (segnalare in meno di un minuto), ma un'**area** semplice al posto della tassonomia a tre livelli, e il collegamento all'attrezzatura guasta. |
| `downtime_log` | `vehicle_downtimes` | Più il **mezzo sostitutivo**: in convenzione 118 la domanda è «con cosa abbiamo coperto il turno». |
| `odometer_readings` | **tenuta** | Il trigger ora rifiuta anche una lettura retrodatata più alta di una successiva. |
| `fuel_logs` (buoni), `fuel_meter_readings`, `cng_dispensings`, `legacy_fuel_stations` | `fuel_logs`, `fuel_invoices`, `fuel_invoice_lines` | Niente pompe interne né colonnine: il controllo vero è dichiarato contro fatturato (§6). |
| `accidents` + dettagli legacy | `accidents`, snellita | Più `during_emergency`: un sinistro con i dispositivi accesi ha un'altra lettura. |
| `tyres`, `tyre_events` | — | Le gomme a matricola hanno senso per 120 bus, non per 20 furgoni. Il cambio gomme è un intervento di tipo `tyres`. |
| `parts`, movimenti di magazzino ricambi | — | Il magazzino che conta qui è quello **sanitario**, con scadenze per lotto (§5). |
| `legacy_*` (~25 tabelle di copia dal gestionale), polizze, broker, contratti, penali, fabbisogno, servizi | — | Dominio TPL o copia di un sistema che qui non esiste. L'RCA è una scadenza; il premio sta nell'adempimento. |
| — | `equipment_types`, `equipment`, `equipment_movements` | **Nuovo**: il registro delle attrezzature con matricola. |
| — | `supply_items`, `supply_lots`, `kit_requirements` | **Nuovo**: materiale di consumo con scadenza e dotazione minima per mezzo. |
| — (prevista nella specifica TPL, mai fatta) | `checklist_templates`, `checklist_template_items`, `checklists`, `checklist_answers` | Qui è centrale: è il controllo a inizio turno. |
| — | `sanitizations` | **Nuovo**: registro delle sanificazioni. |
| `profiles` (email e password insieme al nome) | `profiles` (rubrica) + `profile_accounts` (recapiti e credenziali) + `push_subscriptions` | I volontari segnalano dai **propri dispositivi**: ognuno ha un'utenza, e la rubrica che tutti leggono non deve contenere email, telefoni e password degli altri (§3). |
| `report_comments` | `fault_report_comments` | Il filo fra responsabile e volontario, con note interne invisibili all'equipaggio. |
| `legacy_suppliers` (solo nome e telefono) | `suppliers`, unica | Ogni costo deve poter dire «pagato a chi», e lo stesso soggetto fa più cose. |

---

## 3. Persone

I volontari segnalano guasti (e compilano check-list, registrano
rifornimenti e sanificazioni) da un'**app dedicata sui propri
dispositivi**. Quindi ogni volontario ha un'utenza, e lo schema ne tiene
conto in tre modi.

| Tabella | Campi chiave | Perché così |
|---|---|---|
| `profiles` | nome, ruolo, n. tessera, `is_driver`, sede | È la **rubrica** dell'associazione: la leggono tutti (serve a scrivere «segnalato da…»), quindi contiene solo ciò che è giusto che un volontario veda degli altri. Dati minimi per scelta (GDPR): patenti, abilitazioni e turni non sono materia del parco mezzi. |
| `profile_accounts` | email (unica per associazione, senza distinguere maiuscole), telefono, hash password, ultimo accesso | **Recapiti e credenziali**, separati dalla rubrica: ognuno vede solo i propri, la direzione tutti. Non finiscono nell'audit, che altrimenti conserverebbe gli hash delle password. Una persona senza riga qui esiste ma non ha ancora attivato l'app. |
| `push_subscriptions` | dispositivo (endpoint e chiavi Web Push) | Così chi ha segnalato riceve «presa in carico», «risolta» sul proprio telefono. Più dispositivi per persona. |

Ogni registro dell'equipaggio ha **una sola** colonna «chi»
(`reported_by_id`, `recorded_by_id`, `performed_by_id`, `uploaded_by_id`),
obbligatoria e verso `profiles`. La RLS impedisce a un volontario di
registrare **a nome di un altro**: con i dispositivi personali, senza questo
vincolo chiunque potrebbe firmare la check-list di un collega. I
responsabili invece possono registrare per conto di qualcuno (il buono di
carta portato in sede da chi non ha usato l'app).

Per l'app offline (segnale scarso in deposito) non serve un campo apposta:
gli id sono UUID, li genera il dispositivo, e un invio ripetuto dopo un
errore di rete non duplica la riga.

---

## 4. Il mezzo

Un mezzo sanitario sono due cose: il **veicolo base** (Fiat Ducato, VW
Transporter…) e l'**allestimento** di un allestitore, con una sua
omologazione. I campi di `vehicles` sono raggruppati così.

| Gruppo | Campi | Perché servono |
|---|---|---|
| Identificazione | `internal_code` (numero sulla fiancata), `call_sign` (sigla radio per la centrale 118), `plate`, `vin`, `category`, `status` + `status_reason` | `internal_code` e `plate` sono unici per associazione. La categoria guida check-list, dotazione minima e regole delle scadenze. |
| Veicolo base | marca, modello, versione, alimentazione, classe Euro, kW, **`gross_weight_kg`**, posti, **posti barella**, **posti carrozzina**, serbatoio, misura gomme | La massa complessiva oltre 3.500 kg cambia patente richiesta (C1) e periodicità della revisione: da lei dipendono due regole. Il serbatoio serve a scartare rifornimenti impossibili. |
| Allestimento | allestitore, data, n. omologazione, classe **UNI EN 1789** (A1/A2/B/C), `has_lift`, `has_priority_lights` (art. 177 CdS) | Il sollevatore vero è un'attrezzatura con le sue scadenze; qui c'è solo il fatto che il mezzo ce l'ha. |
| Immatricolazione | data prima immatricolazione, n. carta di circolazione | La prima revisione delle autovetture dipende da questa data. |
| Proprietà e provenienza | `ownership` (proprietà/comodato/leasing/noleggio), intestatario, acquisto e valore, **`funding_source`** (fondi propri, 5×1000, donazione, bando), **`donor_name`**, vita utile, **`bollo_exempt`** | Chi finanzia un mezzo di solito chiede di rendicontare: senza `funding_source` la domanda «cosa abbiamo comprato col 5×1000» non ha risposta. Molti mezzi sanitari di ETS sono esenti dal bollo: se è vero, la scadenza non nasce. |
| Esercizio | `odometer_km` (ricalcolato dal trigger sull'ultima lettura), `fuel_vehicle_code` | Il distributore identifica il mezzo dalla **matricola**. Se la sua matricola coincide con il numero interno il campo resta vuoto; se il distributore ne usa una sua, si scrive qui. |
| Fine vita | data e motivo di dismissione | |

Collegate al mezzo: `odometer_readings` (ogni lettura, da qualunque
fonte), `vehicle_downtimes` (i fermi, con causa e mezzo sostitutivo; al
massimo uno aperto per mezzo).

---

## 5. Attrezzature e materiale sanitario

### 5.1 Attrezzature (con matricola)

`equipment_types` è il catalogo (precaricato, estendibile); `equipment` è
l'oggetto: DAE matricola X, aspiratore Y.

| Campo | Perché |
|---|---|
| `inventory_code`, produttore, modello, `serial_number` | Il registro deve rispondere a «dov'è il DAE con matricola X». |
| `vehicle_id` **oppure** `site_id` (mai entrambi: vincolo) + `position_note` | A bordo di un mezzo o in sede di scorta. |
| `status` (in uso, scorta, in assistenza, fuori uso, dismesso) | |
| `ownership` + `owner_name` | Il DAE in comodato dall'AST è frequente quanto l'ambulanza donata, e cambia chi fa la manutenzione. |
| `manufactured_on` | Per bombole ed estintori la vita del recipiente parte dalla fabbricazione. |
| `attributes` (jsonb tipizzato) | Ciò che è proprio di un tipo: capacità della bombola, kg e agente dell'estintore. |

Sul tipo, due flag che fanno lavoro:

- `electromedical`: soggetto a verifica di sicurezza elettrica (CEI EN 62353);
- **`mission_critical`**: se l'oggetto è guasto o scaduto, il mezzo che lo
  richiede in dotazione **non può uscire** (DAE, aspiratore, barella
  autocaricante, sollevatore del pulmino). È il collegamento fra lo stato di
  un'attrezzatura e la disponibilità del mezzo.

`equipment_movements` tiene la storia degli spostamenti: le scadenze sono
dell'oggetto, non del mezzo, e lo seguono.

### 5.2 Materiale di consumo (senza matricola, con lotto)

| Tabella | Cosa tiene |
|---|---|
| `supply_items` | Catalogo: garze, soluzione fisiologica, maschere O2, cannule, elettrodi DAE di scorta… con `tracks_expiry`. |
| `supply_lots` | Quanto c'è, di quale lotto, **dove** (mezzo o sede) e **quando scade**. Giacenza a conteggio: si aggiorna al reintegro e al controllo, non a ogni servizio. Per 20 mezzi basta e non chiede ai volontari di scaricare ogni garza. |
| `kit_requirements` | Dotazione minima per categoria di mezzo (tipo di attrezzatura **o** articolo, con quantità). Risponde a «cosa manca a bordo» e alimenta le voci della check-list. |

---

## 6. Rifornimenti

Il flusso descritto: tutti i mezzi si riforniscono da **un distributore
convenzionato** che a fine mese emette **una fattura**. Ci sono due racconti
dello stesso fatto, e il valore sta nel confrontarli.

```
alla pompa                       a fine mese
──────────                       ───────────
fuel_logs                        fuel_invoices  (testata: n., data, periodo, totali, SdI)
 mezzo, data/ora, km,              └─ fuel_invoice_lines  (il riepilogo, riga per riga:
 litri, importo, n. buono,             data, matricola com'è scritta, litri, importo, n. buono)
 pieno sì/no, chi
            \                      /
             └── abbinamento ─────┘   domain/fuel-reconciliation.ts
                   │
                   ├─ matched     riga e rifornimento tornano
                   ├─ mismatch    c'è un candidato ma litri/importo non tornano → da guardare
                   ├─ unmatched   fatturato ma mai registrato → chiedere al distributore / al turno
                   └─ (non fatturati) registrati ma assenti in fattura
```

Campi che contano e perché:

| Campo | Perché |
|---|---|
| `fuel_logs.receipt_number` | La prova più forte per l'abbinamento. Si confronta insieme alla data, perché i numeri dei buoni si ripetono. |
| `fuel_logs.full_tank` | Il consumo (km/l) si calcola solo fra due pieni: un rabbocco da 20 € non dice quanto ha bevuto il mezzo. |
| `fuel_logs.unit_price_eur` | Calcolato dal database da importo/litri: mai scritto a mano, resta coerente. |
| `fuel_invoice_lines.vehicle_ref_raw` accanto a `vehicle_id` | La matricola com'è scritta dal distributore: se il riconoscimento sbaglia, il dato d'origine c'è ancora. |
| `fuel_invoice_lines.fuel_log_id` (unico) | Un rifornimento si abbina a una riga sola: niente doppio pagamento. |
| `fuel_invoices.lines_include_vat` + `vat_rate_pct` | Lo scontrino alla pompa è IVA inclusa; se il riepilogo è imponibile va riportato al lordo prima del confronto. |
| `fuel_invoices.status` | `received → reconciled → approved → paid` (+ `disputed`): si paga solo una fattura con tutte le righe spiegate. |

**Riconoscere il mezzo dalla matricola** (`resolveVehicleId`). Prova, in
ordine: la matricola del distributore registrata sul mezzo
(`fuel_vehicle_code`), il numero interno, la targa. Le matricole numeriche
si confrontano senza zeri iniziali («005» e «5» sono lo stesso mezzo). Se a
un livello i mezzi possibili sono più di uno, non indovina: la riga resta
da abbinare a mano.

Tolleranze di default: ±1 giorno, ±0,5 litri, ±0,50 €. A parità di
candidati vince la coppia più vicina in assoluto, non la prima trovata: con
due pieni nello stesso giorno l'ordine delle righe non decide.

---

## 7. Scadenze

### 7.1 Come funziona

| Tabella | Ruolo |
|---|---|
| `deadline_types` | Il catalogo: periodicità di default (mesi **o** giorni, e/o km), preavviso in giorni e km, `month_end`, `blocking`, `document_required`, riferimento normativo. |
| `deadline_rules` | A chi si applica e ogni quanto: una categoria di mezzo **o** un tipo di attrezzatura. I campi nulli ereditano dal tipo (`resolveRule`). È qui che la stessa «revisione» vale 12 mesi per un'ambulanza e 24 per un'automedica. |
| `deadlines` | La scadenza corrente di **un** mezzo **o** **un'**attrezzatura. Nasce dalla regola e da lì è sua: si corregge riga per riga (il tagliando di quel Ducato è a 40.000 km). |
| `deadline_completions` | Ogni adempimento: data, km, esito (`passed`/`conditional`/`failed`), prossima scadenza, fornitore, n. documento, **costo**, intervento collegato. È anche da qui che il costo di un mezzo prende premio RCA, bollo e revisioni. |

Regole del motore (`domain/deadlines.ts`, logica pura e testata):

- date come giorni di calendario (`YYYY-MM-DD`), mai istanti: niente
  «scade oggi» che diventa «scaduto» per il fuso del server;
- `month_end`: la revisione si fa **entro il mese** dell'anniversario;
- con data e km insieme **vale il primo raggiunto**;
- una scadenza senza data né km è **«da completare»**, non «in regola»: il
  semaforo la mostra gialla;
- semaforo del mezzo: **rosso** se una scadenza bloccante è superata,
  **giallo** se qualcosa è in preavviso, superato ma non bloccante, o senza
  data; **verde** altrimenti.

### 7.2 Ogni associazione gestisce i propri scadenzari

Il catalogo del seed è un punto di partenza, non un vincolo. Dall'app
l'associazione **sceglie, aggiunge, modifica ed elimina** tipi di
scadenza, regole e singole scadenze. Le regole dello schema:

- **scegliere**: una regola si cancella (le bombole sono a scambio? via il
  collaudo) oppure si restringe per proprietà con `ownership_kinds`: con
  `{owned}` il collaudo nasce solo per le bombole dell'associazione, non per
  quelle del fornitore né per il DAE in comodato dall'AST. Chi fa la
  manutenzione di cosa lo decide ogni associazione, una volta;
- **aggiungere**: tipi propri (es. «Rinnovo comodato con il Comune»,
  «Verifica sirena»), regole proprie, scadenze singole su un mezzo o
  un'attrezzatura anche fuori da ogni regola;
- **modificare**: periodicità, preavviso e blocco si correggono sul tipo,
  sulla regola o sulla singola scadenza;
- **eliminare senza perdere lo storico**: `remove_deadline` e
  `remove_deadline_type` cancellano ciò che non ha adempimenti registrati e
  **archiviano** ciò che li ha (una revisione fatta è documentazione). Dicono
  sempre cosa è successo (`deleted` / `archived`); un'archiviata sparisce da
  scadenzario e semaforo e si ripristina. Un `DELETE` a mano di una
  scadenza con storico fallisce sul vincolo: lo storico non si perde per
  errore.

Le modifiche agli scadenzari passano dall'audit log. Quando nasce un mezzo
o un'attrezzatura, `planDeadlines` decide quali scadenze creare: le regole
della sua categoria o del suo tipo, filtrate per proprietà, senza i tipi
archiviati, senza il bollo per i mezzi esenti. Le scadenze nascono «da
completare»: la prima data la scrive chi ha il documento.

### 7.3 Il catalogo iniziale

Periodicità e riferimenti di partenza, **da validare** con il responsabile
mezzi e il responsabile sanitario. Dove la norma lascia la periodicità al
fabbricante, il valore è quello tipico e va corretto sul manuale del
dispositivo vero.

**Mezzi**

| Scadenza | Periodicità | Blocca | Riferimento / note |
|---|---|---|---|
| Revisione periodica | 12 mesi ambulanze · 24 mesi automedica, pulmino, auto (fine mese) | sì | CdS art. 80. Per le autovetture la prima è a 4 anni dall'immatricolazione: la data iniziale si inserisce a mano. Pulmini oltre 9 posti: verificare, potrebbero essere annuali. |
| Assicurazione RCA | 12 mesi | sì | CdS art. 193. Con polizza a libro matricola il rinnovo si registra su ogni mezzo con la sua quota di premio. |
| Tassa automobilistica | 12 mesi (fine mese) | no | Non nasce per i mezzi esenti. |
| Tagliando | 12 mesi o 30.000 km | no | Piano del costruttore: correggere per mezzo. |
| Autorizzazione al trasporto sanitario | dall'atto | sì | Regione Marche, L.R. 36/1998 e atti attuativi: durata e rinnovo da verificare. Solo mezzi sanitari. |
| Sanificazione periodica | 30 giorni | no | Protocollo dell'associazione; si chiude registrando una sanificazione «periodica». |

**Attrezzature**

| Scadenza | Si applica a | Periodicità | Blocca |
|---|---|---|---|
| Manutenzione preventiva del fabbricante | DAE, monitor, aspiratore, ventilatore, barella autocaricante, sollevatore (bloccante); sedia portantina, presidi di immobilizzazione (non bloccante); riduttori O2 (60 mesi) | 12 mesi | vedi colonna |
| Verifica di sicurezza elettrica (CEI EN 62353) | elettromedicali | 12 mesi | no |
| Scadenza elettrodi / piastre | DAE, monitor-defibrillatore | data sulla confezione | sì |
| Sostituzione batteria | DAE, monitor-defibrillatore | data del fabbricante | sì |
| Revisione recipiente in pressione | bombole O2 (120 mesi), estintori polvere (144) e CO2 (120) | vedi colonna | sì |
| Scadenza lotto ossigeno medicinale | bombole O2 | data in etichetta | sì |
| Controllo periodico estintore (UNI 9994-1) | estintori | 6 mesi | no |
| Revisione estintore (UNI 9994-1) | polvere 36 mesi · CO2 60 mesi | vedi colonna | no |
| Fine vita dichiarata | barella autocaricante, sedia portantina | dal manuale | sì |

---

## 8. Check-list, sanificazioni, segnalazioni, interventi, sinistri

**Check-list «controllo mezzo»** (`checklist_templates` per categoria →
`checklist_template_items` → `checklists` → `checklist_answers`). Ogni
voce può essere un controllo OK/anomalia o un valore da leggere con soglia
(pressione O2 sotto 50 bar = anomalia), può essere **safety-critical**
(un'anomalia blocca il mezzo fino alla verifica del responsabile) e può
riferirsi a un tipo di attrezzatura o a un articolo della dotazione. Km e
livello carburante stanno in testata. Una check-list inviata **non si
modifica** (la RLS lo consente solo alla direzione): è documentazione. Le
voci dei modelli non si cancellano, si disattivano, e `template_version`
tiene leggibili le check-list vecchie. Il seed precarica quattro modelli:
ambulanza, automedica, pulmino disabili, mezzo generico.

**Sanificazioni** (`sanitizations`): tipo (ordinaria, periodica,
straordinaria dopo paziente infettivo), chi, quando, prodotto e lotto,
metodo, durata del fermo. Per la straordinaria si registra **solo il
fatto**: nessun dato del paziente né della patologia.

**Segnalazioni** (`fault_reports`, numerate `SGN-AAAA-NNNNN`), dall'app
dei volontari: mezzo, attrezzatura se è lei a essere guasta, area,
descrizione, gravità a tre livelli, flag «il mezzo non è sicuro», chi ha
segnalato, collegamento all'intervento che la risolve e alla risposta della
check-list che l'ha generata. Il filo dei messaggi
(`fault_report_comments`) chiude il cerchio con chi ha segnalato («mi mandi
una foto della spia?»); le note `internal` fra responsabili l'equipaggio
non le vede. I commenti non si modificano.

**Interventi** (`maintenance_jobs`, `MAN-AAAA-NNNNN`): mezzo e/o
attrezzatura, fornitore (nullo = fatto in casa), tipo, stato, consegna e
ritiro (il fermo), km, preventivo, **imponibile, IVA e totale** (per
un'associazione che non detrae l'IVA il costo vero è il totale), fattura,
garanzia, sinistro collegato.

**Sinistri** (`accidents`, `SIN-AAAA-NNNNN`): fatto, autista (volontario),
`during_emergency`, colpa, controparte, CAI firmata, verbale, feriti sì/no,
compagnia e n. pratica, stima, liquidato, franchigia. Nessun dato di
feriti o testimoni.

**Allegati** (`attachments`): una tabella per tutti i documenti (certificati,
fatture, carta di circolazione, foto). Il file sta su MinIO, qui il
riferimento.

---

## 9. Ruoli e permessi

Ogni tabella ha una policy di isolamento per associazione; sopra, policy
**restrittive** per ruolo (una riga passa solo se le soddisfa tutte, quindi
l'isolamento non si può dimenticare aggiungendo un ruolo). Verificate da
[`tests/rls.test.sql`](../packages/db/tests/rls.test.sql), eseguito con il
ruolo applicativo vero.

| Risorsa | crew | fleet_manager | equipment_manager | admin_finance | admin |
|---|---|---|---|---|---|
| Mezzi, sedi, fornitori, fermi, modelli di check-list | R | CRUD | R | R | CRUD |
| Attrezzature, materiale, dotazione, tipi e regole di scadenza, scadenze | R | CRUD | CRUD | R | CRUD |
| Adempimenti delle scadenze | R | CRUD | CRUD | CRUD | CRUD |
| Interventi, sinistri (contengono costi) | — | CRUD | CRU | RU | CRUD |
| Segnalazioni, rifornimenti, letture km, allegati | CR¹ | CRUD | CRU | CRU | CRUD |
| Check-list, sanificazioni (documentazione) | CR¹ | CR | CR | CR | CRUD |
| Commenti alle segnalazioni | CR¹ (senza note interne) | CR² | CR² | CR² | CRD² |
| Fatture carburante | — | R | — | CRUD | CRUD |
| Rubrica (`profiles`) | R | R | R | R | CRUD |
| Recapiti e credenziali (`profile_accounts`) | RU propri | RU propri | RU propri | RU propri | CRUD |
| Dispositivi push | CRUD propri | R tutti, CRUD propri | come fleet_manager | come fleet_manager | come fleet_manager |
| Audit log | — | — | — | R | R |

¹ solo a proprio nome. ² solo a proprio nome, anche note interne.

---

## 10. Cosa resta fuori, di proposito

- **Turni, servizi e missioni**: sono la gestione operativa dell'associazione,
  non il parco mezzi. Il turno compare solo come testo sulla check-list.
- **Dati dei pazienti**: mai, nemmeno per la sanificazione straordinaria.
- **Patenti e abilitazioni dei volontari**: solo `is_driver`.
- **Righe degli interventi, magazzino a movimenti, polizze come contratto**
  (massimali, regolazione premio): si aggiungono senza toccare le tabelle
  esistenti quando serviranno davvero.

---

## 11. Decisioni

### Prese

| # | Domanda | Risposta | Effetto sullo schema |
|---|---|---|---|
| 1 | Branch `main` per la PR | sì | — |
| 2 | Database | dedicato | schema `fleetcare` in un database solo suo |
| 3 | Volontari con utenza? | sì: segnalano da un'app dedicata, sui propri dispositivi | `crew_members` confluisce in `profiles`; recapiti e credenziali in `profile_accounts`; `push_subscriptions`; «solo a proprio nome» nella RLS (§3) |
| 4 | Come il distributore identifica il mezzo | dalla matricola | `fuel_vehicle_code` sul mezzo, `vehicle_ref_raw` sulla riga, riconoscimento matricola → numero interno → targa (§6) |
| 5 | Bombole, DAE in comodato, chi tiene quali scadenze | lo sceglie ogni associazione | scadenzari interamente gestibili, `ownership_kinds` sulle regole, eliminazione con archiviazione dello storico (§7.2) |

### Ancora aperte

1. **«Matricola» = numero interno?** L'ho interpretata come il codice con cui
   il distributore indica il mezzo: se è il numero interno dell'associazione
   non serve altro; se è un suo codice, va scritto su ogni mezzo
   (`fuel_vehicle_code`). Una fattura vera lo chiarisce.
2. **Accesso dei volontari**: password o link via email? Con un centinaio di
   volontari sui propri telefoni il link via email evita le password
   dimenticate; `password_hash` è già facoltativo per questo.
3. **Revisione di pulmini e automedica**: la periodicità dipende da come sono
   immatricolati. Va letta sulle carte di circolazione.
4. **Autorizzazione sanitaria regionale**: durata e documento di riferimento
   per la Regione Marche.
5. **Dotazione minima**: il seed è indicativo; va validata col direttore
   sanitario o con il riferimento regionale.
6. **Blocco automatico**: quando una scadenza bloccante è superata, il mezzo
   passa a `grounded` da solo (job notturno) o si avvisa e basta? La mia
   raccomandazione è il blocco automatico con notifica, perché un'ambulanza
   con l'RCA scaduta che esce è il caso da rendere impossibile. Da decidere
   prima di scrivere il job.
7. **Frequenza della sanificazione periodica** (seed: 30 giorni).

---

## 12. Prossimi passi

1. **Dati reali del parco**: per ogni mezzo targa, numero interno, sigla
   radio, categoria, marca/modello, allestitore, prima immatricolazione,
   massa complessiva, proprietà, esenzione bollo. Con questi l'import crea i
   mezzi e, dalle regole, tutte le loro scadenze (da completare con le date
   vere).
2. **Inventario delle attrezzature** con matricole e posizione.
3. **Una fattura vera del distributore** (XML e riepilogo) per scrivere
   l'import e tarare le tolleranze dell'abbinamento.
4. Poi le app: per i volontari (PWA sui propri dispositivi: segnalazioni,
   check-list, rifornimenti, notifiche) e per i responsabili (scadenzario
   semaforico e sua configurazione, scheda mezzo, riconciliazione mensile
   del carburante).
