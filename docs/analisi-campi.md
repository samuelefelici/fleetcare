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
| — | `crew_members` | **Nuovo**: chi fa le cose, anche senza utenza (§3). |
| `legacy_suppliers` (solo nome e telefono) | `suppliers`, unica | Ogni costo deve poter dire «pagato a chi», e lo stesso soggetto fa più cose. |

---

## 3. Persone

| Tabella | Campi chiave | Note |
|---|---|---|
| `profiles` | email, nome, ruolo, hash password | Le utenze dell'app (Auth.js). |
| `crew_members` | nome, n. tessera, `is_driver`, `profile_id` facoltativo | Molti volontari non avranno mai un'utenza: la check-list si compila sul tablet di sede scegliendo il proprio nome. Quando un volontario ha anche l'utenza, `profile_id` li lega. **Dati minimi per scelta (GDPR)**: patenti, abilitazioni e turni non sono materia del parco mezzi. |

Ogni registro dell'equipaggio (check-list, rifornimenti, sanificazioni,
segnalazioni, letture km) porta sia `crew_member_id` (chi l'ha fatto) sia
l'utenza che l'ha registrato, quando c'è.

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
| Esercizio | `odometer_km` (aggiornato dal trigger), `fuel_card_code` | Il codice tessera serve a riconoscere il mezzo nelle righe di fattura quando il distributore non scrive la targa. |
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
 litri, importo, n. buono,             data, targa com'è scritta, litri, importo, n. buono)
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
| `fuel_invoice_lines.plate_raw` accanto a `vehicle_id` | Se il riconoscimento sbaglia, il dato d'origine c'è ancora. |
| `fuel_invoice_lines.fuel_log_id` (unico) | Un rifornimento si abbina a una riga sola: niente doppio pagamento. |
| `fuel_invoices.lines_include_vat` + `vat_rate_pct` | Lo scontrino alla pompa è IVA inclusa; se il riepilogo è imponibile va riportato al lordo prima del confronto. |
| `fuel_invoices.status` | `received → reconciled → approved → paid` (+ `disputed`): si paga solo una fattura con tutte le righe spiegate. |

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

### 7.2 Il catalogo iniziale

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

**Segnalazioni** (`fault_reports`, numerate `SGN-AAAA-NNNNN`): mezzo,
attrezzatura se è lei a essere guasta, area, descrizione, gravità a tre
livelli, flag «il mezzo non è sicuro», collegamento all'intervento che la
risolve e alla risposta della check-list che l'ha generata.

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
| Mezzi, sedi, volontari, fornitori, fermi, modelli di check-list | R | CRUD | R | R | CRUD |
| Attrezzature, materiale, dotazione, tipi e regole di scadenza, scadenze | R | CRUD | CRUD | R | CRUD |
| Adempimenti delle scadenze | R | CRUD | CRUD | CRUD | CRUD |
| Interventi, sinistri (contengono costi) | — | CRUD | CRU | RU | CRUD |
| Segnalazioni, rifornimenti, letture km, allegati | CR | CRUD | CRU | CRU | CRUD |
| Check-list, sanificazioni (documentazione) | CR | CR | CR | CR | CRUD |
| Fatture carburante | — | R | — | CRUD | CRUD |
| Utenze | R | R | R | R | CRUD |
| Audit log | — | — | — | R | R |

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

## 11. Decisioni aperte

Queste non le ho scelte io: servono risposte per chiudere la prima versione.

1. **Nome e database.** Il repo si chiama `fleetcare` come il modulo TPL di
   Cerbero. Lo schema assume un **database dedicato**: confermare, e decidere
   se il prodotto per le associazioni avrà un nome suo.
2. **Volontari con utenza o tablet di sede?** Lo schema regge entrambi
   (`crew_members` + `profiles`), ma la scelta decide il login e la PWA.
3. **Come il distributore identifica il mezzo e in che formato manda il
   riepilogo** (righe nella FatturaPA, PDF allegato, CSV)? Decide l'import.
   Esiste una tessera per mezzo?
4. **Bombole O2: di proprietà o del fornitore** (scambio vuoto per pieno)?
   Se sono del fornitore, collaudo e scadenza del gas sono suoi: le scadenze
   si disattivano.
5. **Attrezzature in comodato dall'AST/118** (DAE, monitor): la manutenzione
   la fanno loro o l'associazione? Decide se le scadenze sono nostre.
6. **Revisione di pulmini e automedica**: la periodicità dipende da come sono
   immatricolati. Va letta sulle carte di circolazione.
7. **Autorizzazione sanitaria regionale**: durata e documento di riferimento
   per la Regione Marche.
8. **Dotazione minima**: il seed è indicativo; va validata col direttore
   sanitario o con il riferimento regionale.
9. **Blocco automatico**: quando una scadenza bloccante è superata, il mezzo
   passa a `grounded` da solo (job notturno) o si avvisa e basta? La mia
   raccomandazione è il blocco automatico con notifica, perché un'ambulanza
   con l'RCA scaduta che esce è il caso da rendere impossibile. Da decidere
   prima di scrivere il job.
10. **Frequenza della sanificazione periodica** (seed: 30 giorni).

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
4. Poi l'app (`apps/web`): scadenzario semaforico, scheda mezzo, check-list
   PWA da tablet, rifornimenti con riconciliazione mensile.
