# ViaLibera

Preparazione patente B: simulazioni d'esame e allenamenti per argomento basati sul catalogo
ufficiale importato (AB 2025-04-23). Nessuna registrazione richiesta.

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
- In allenamento **nessun timeout cambia domanda**: le sessioni practice/mistakes non scadono.
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

## Persistenza locale

- Simulazione: `vialibera:exam:v1:{sessionId}`
- Allenamento: `vialibera:practice:v1:{sessionId}` (chiave separata e versionata)

Il refresh ripristina posizione e risposte; lo stato corrotto o con payload incompatibile viene
scartato; localStorage non disponibile non causa crash.

## Sviluppo

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
