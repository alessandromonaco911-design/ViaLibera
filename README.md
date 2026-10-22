# ViaLibera

Preparazione patente B: simulazioni d'esame e allenamenti per argomento basati sul catalogo
AB del Portale dell’Automobilista verificato il 22 ottobre 2026. Nessuna registrazione richiesta.

## Modalità

Le sessioni usano il campo `mode` di `exam_sessions`:

| mode | nome | feedback | timer | scopo |
|---|---|---|---|---|
| `simulation` | Simulazione | nascosto fino alla consegna | 20 minuti | esame (30 domande, max 3 errori) |
| `practice` | Allenamento | immediato per singola risposta | nessuno | allenarsi su un argomento (10/20/30) |
| `mistakes` | Ripasso errori | immediato per singola risposta | nessuno | ripassare solo gli errori di una sessione completata |

## Comportamento senza auto-advance

- Selezionare VERO o FALSO **non cambia domanda** e non verifica nulla.
- In allenamento compare "Verifica risposta": il risultato è calcolato server-side.
- L'utente passa alla domanda successiva **solo** tramite "Avanti", il navigatore o la freccia destra
  (in allenamento la freccia avanza solo dopo la verifica).
- In allenamento **nessun timeout cambia domanda**: nessun timer durante il quiz; la manutenzione può rimuovere sessioni abbandonate secondo la politica descritta sotto.
- In simulazione il feedback resta nascosto fino alla consegna.

Non è disponibile alcuna spiegazione generata: quando una domanda non ha una spiegazione
revisionata non ne viene mostrata nessuna.

## Percorsi

- `/` — homepage (Inizia simulazione / Allenati per argomento + resume cards separate)
- `/simulazione/[sessionId]` — esecuzione simulazione
- `/simulazione/[sessionId]/risultato` — risultato simulazione
- `/allenamento` — elenco argomenti (conteggi dal database)
- `/allenamento/argomento/[topicId]` — configurazione (10/20/30 domande)
- `/allenamento/[sessionId]` — esecuzione allenamento/ripasso
- `/allenamento/[sessionId]/risultato` — riepilogo allenamento + "Ripassa gli errori"

## API principali

- `POST /api/exams` — crea simulazione (`{ seed? }`)
- `GET /api/exams/[sessionId]` — stato simulazione (nessuna soluzione)
- `POST /api/exams/[sessionId]/submit` — consegna e correzione server-side
- `POST /api/practice` — crea allenamento (`{ topicId, questionCount: 10|20|30, seed? }`)
- `GET /api/practice/[sessionId]` — stato allenamento (soluzioni solo per domande verificate)
- `POST /api/practice/[sessionId]/answer` — verifica singola risposta (unico endpoint che rivela la soluzione)
- `POST /api/practice/[sessionId]/complete` — completa e calcola il riepilogo (idempotente)
- `POST /api/practice/mistakes` — crea ripasso errori (`{ sourceSessionId, seed? }`)

Le soluzioni delle domande non verificate **non sono mai esposte** nei payload GET; la correttezza
è sempre calcolata server-side. La media policy è centralizzata in `src/lib/media/policy.ts`.

## Catalogo attivo e storico

Le nuove sessioni usano la versione AB `observed-2026-10-22`, configurata in
`src/config/catalog.ts`: 7.020 quesiti e 407 immagini dal PDF del Portale
dell'Automobilista verificato il 22 ottobre 2026. La data indica la verifica dello
snapshot, senza attribuire una decorrenza normativa o garantire il 2027.
La versione `2025-04-23` resta disponibile per riprendere e correggere le sessioni
precedenti e ripassarne gli errori. Non vengono cancellati i quesiti storici.

Per importare questo snapshot su un database preparato, dopo un backup:

```bash
npm run db:import-catalog -- --dry-run ab-observed-2026-10-22
npm run db:import-catalog -- --apply ab-observed-2026-10-22
npm run db:verify-import -- ab-observed-2026-10-22
```

Servono il PDF, il manifest e i derivati verificati della pipeline; non sono
generati né scaricati durante l'avvio web. Importazione e registrazione della
fonte avvengono nella stessa transazione. Il verificatore confronta tutti i
quesiti della versione, oltre a conteggi, provenienza e associazioni immagini.
Il selettore richiede la versione esatta: un'importazione mancante o incompleta
non provoca un passaggio silenzioso a un altro catalogo.

## Persistenza locale

- Simulazione: `vialibera:exam:v1:{sessionId}`
- Allenamento: `vialibera:practice:v1:{sessionId}` (chiave separata e versionata)

Il refresh ripristina posizione e risposte; lo stato corrotto o con payload incompatibile viene
scartato; localStorage non disponibile non causa crash.

## Sviluppo

Per build distribuibile, limiti delle nuove sessioni e manutenzione controllata,
vedere [le istruzioni di pubblicazione](docs/deployment.md).

```bash
npm install
npm run dev            # dev server
npm run build          # production build (richiesta prima degli E2E)
npm test               # unit/integration test (node:test)
npm run test:e2e       # Playwright E2E (4 viewport)
npm run lint
npm run typecheck
npm run data:validate
npm run db:verify-import
npm run exam:audit-distribution
npm run db:cleanup-dev-sessions -- --dry-run   # --apply per eseguire
npm run db:cleanup-expired-exams -- --older-than-days 30 --dry-run
```

PostgreSQL gira in Docker (`docker compose up -d`, porta 5433). Le migration si applicano con
`npm run db:migrate` o `npx drizzle-kit push`.

### Avvio rapido

Il file `avvia-app.bat` nella root del progetto verifica/avvia Docker e il database, controlla la
porta 3000 e avvia il frontend aprendo il browser:

```
avvia-app.bat           avvia in PRODUZIONE (build + start): stabile e veloce
avvia-app.bat --dev     avvia il dev server (hot reload)
avvia-app.bat --clean   cancella la cache .next prima di avviare
```

Nota: in questo ambiente (filesystem lento su E:) il dev server può diventare irresponsivo dopo
poche richieste; la modalità di default (produzione) è stabile ed è quella consigliata per
usare l'applicativo.

Il comando `npm run start` ascolta su `127.0.0.1`: aprire http://127.0.0.1:3000/.
Fermare il server prima di ricompilare la sua build. Dopo l'avvio, `npm run verify:local`
controlla la homepage e i CSS/JavaScript effettivamente referenziati, intercettando anche
un processo vecchio che richiede file non più presenti. È possibile controllare un'altra
porta con `npm run verify:local -- http://127.0.0.1:3210`.

### Warning su hydration mismatch (solo dev) — risolto

In passato, con il dev server su Turbopack (`next dev`), poteva comparire nel browser l'errore
"A tree hydrated but some attributes of the server rendered HTML didn't match" sull'attributo
`className` dell'elemento `<html>` (classi `geist_..._variable` dei font). Causa: bug noto di
`next/font` con Turbopack in dev, che genera hash CSS diversi tra server e client.

Il dev server ora usa **webpack** (`npm run dev` = `next dev --webpack`), che produce hash
deterministici: il mismatch non si manifesta più. La build di produzione non era mai stata
interessata. Se il problema dovesse ripresentarsi, cancellare la cache e riavviare:

```
rmdir /s /q .next
npm run dev
```

oppure, con lo script:

```
avvia-app.bat --clean
```
