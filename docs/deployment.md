# Preparazione della pubblicazione

L’app richiede Node.js, PostgreSQL e i file in `public/`. PDF e cartelle
`data/official`, `data/processed` e `data/media` servono alla pipeline di importazione,
non alle richieste web. Anche la ripresa dell’allenamento e gli URL media storici
usano ora le immagini pubbliche. Tutte le 409 immagini referenziate dai due cataloghi
sono tracciate in Git; i 407 file del catalogo attivo ne sono un sottoinsieme.

## Build e avvio

```bash
npm ci
npm run build
npm run start:host
```

L’hosting deve fornire `DATABASE_URL` come segreto del server e `PORT` se richiesto.
`start:host` ascolta su `0.0.0.0`; `npm start` resta dedicato all’uso locale su
`127.0.0.1`. Usare la connessione pooled del database per un ambiente serverless.
Non eseguire migrazioni o importazioni durante ogni avvio web.

Prima di avviare questa versione sul database di destinazione:

```bash
npm run db:migrate
npm run db:import-catalog -- --dry-run ab-observed-2026-10-22
npm run db:import-catalog -- --apply ab-observed-2026-10-22
npm run db:verify-import -- ab-observed-2026-10-22
```

L’importazione richiede gli input verificati della pipeline e un backup preventivo;
non distribuirli con il server web. Neon è stato aggiornato il 22 ottobre 2026,
dopo backup e prova di ripristino; sono state conservate le sue 21 sessioni e 550 righe associate.
La versione attiva è selezionata esplicitamente in `src/config/catalog.ts`.

Per il backup del Neon configurato, usando il client PostgreSQL 18 in Docker:

```bash
node --env-file=.env.neon scripts/db/backup-neon.mjs
```

Il comando crea un archivio in `test-output`, ne prova il ripristino in un database
temporaneo e confronta le impronte dello storico. Non stampa le credenziali.
Le istanze temporanee sono rimosse al termine; il backup resta escluso da Git.

Nel database locale lo schema della migrazione 0006 era stato applicato senza
registrarlo. Il comando seguente verifica esattamente tutte le colonne, i vincoli
e gli indici interessati; `--apply` registra la migrazione solo se coincidono:

```bash
node --import tsx --env-file=.env scripts/db/baseline-practice-migration.ts
node --import tsx --env-file=.env scripts/db/baseline-practice-migration.ts --apply
```

Serve esclusivamente in presenza di questa discrepanza. Un database nuovo deve
eseguire normalmente l’intera catena delle migrazioni.

## Limiti di creazione

Le tre API di avvio condividono contatori PostgreSQL, validi su più istanze:

| Budget iniziale | Limite |
| --- | --- |
| Singolo identificativo del browser | 8 tentativi in una finestra di 10 minuti |
| Intera applicazione | 60 tentativi in una finestra oraria |
| Intera applicazione | 300 tentativi in una finestra giornaliera |

Le finestre sono fisse e allineate all’epoca UTC. Le richieste rifiutate restituiscono
HTTP 429 e `Retry-After`; non consumano ulteriormente gli altri contatori e non
creano sessioni. Ripresa, risposte, consegna e risultati restano accessibili.
Il controllo precede generazione e scrittura delle sessioni, dopo la validazione
del corpo: gli avvii che falliscono successivamente consumano comunque un tentativo.

Il cookie tecnico `vialibera-device` contiene un UUID casuale, dura 30 giorni ed è
HttpOnly, SameSite=Lax e Secure in produzione. Il database ne conserva un hash;
non registra indirizzi IP e non si fida di header inoltrati dal client. Cancellare
il cookie permette un nuovo identificativo: il limite globale protegge il budget
anche in questo caso. Questi contatori limitano la crescita delle sessioni, senza
sostituire le protezioni di traffico dell’hosting.

Tutte le istanze di produzione devono usare lo stesso `SESSION_CREATION_NAMESPACE`
(valore predefinito `creation`). Test e prova di release utilizzano namespace
distinti. Adeguare i valori in `src/lib/security/session-creation.ts` al traffico
previsto prima del lancio pubblico; un budget globale esaurito ferma i nuovi avvii
anche per gli altri utenti.

## Manutenzione

```bash
npm run db:maintain-sessions
npm run db:maintain-sessions -- --apply --environment=production
```

Il primo comando è sempre una simulazione. La politica riguarda esclusivamente
sessioni non concluse dell’ambiente scelto:

- senza risposte sul server: rimozione dopo 7 giorni di inattività;
- con risposte: rimozione dopo 90 giorni dall’ultima attività registrata;
- esami con timer ancora valido, risultati completati, sessioni referenziate da
  ripassi e cataloghi storici: conservati.

Una scelta VERO/FALSO non ancora verificata in allenamento resta nel browser e non
costituisce attività registrata sul server. L’attività considera sia la sessione
sia i timestamp delle risposte. Ogni esecuzione tratta al massimo 500 sessioni e
libera anche i contatori scaduti. La cancellazione è transazionale con cascata sulle
righe correlate; se il database è occupato, tenta brevemente e poi rinuncia senza
lasciare modifiche parziali. I risultati completati possono ancora far crescere lo
storage: misurarne l’occupazione prima di scegliere un piano gratuito.

Non è stata attivata alcuna cancellazione periodica. Dopo backup e verifica della
simulazione, collegare il comando al sistema di job dell’hosting scelto. Eseguirlo
in orari tranquilli e monitorare l’esito. La simulazione locale iniziale ha individuato
309 sessioni, senza cancellarle.

## Verifica ripetibile della distribuzione

```bash
npm run verify:release
```

Il comando richiede il database locale e copia una lista esplicita di sorgenti e
asset in `test-output/release-*`, senza note, `.env`, PDF o derivati di estrazione.
Riutilizza le dipendenze installate del progetto: non sostituisce un `npm ci` in CI.
Compila quella copia, avvia un server separato sulla porta 3211 e verifica CSS/JS,
hash delle immagini, esame, allenamento, ripresa, risultati, ripasso e compatibilità
dei vecchi URL media. Rimuove soltanto le sessioni create dalla prova e salva
`proof.json` e `build.log`. Un errore fa terminare il comando con esito non zero.

I test con database condiviso vengono eseguiti per file in sequenza; il test della
quota esegue comunque richieste concorrenti per verificare l’assenza di sforamenti.
Non avviare due processi Playwright insieme sulla porta 3210.

Restano da eseguire la preparazione del database remoto, la scelta dell’hosting,
la preview con i suoi limiti reali e la relativa verifica prima del dominio pubblico.
