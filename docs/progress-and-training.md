# Progressi personali e allenamento continuo

Interfaccia approvata: quarta destinazione Progressi nella navigazione principale;
panoramica con precisione, copertura, ultime prove e consiglio di oggi. Da ripassare
e Traguardi sono pagine di dettaglio con ritorno esplicito, senza caroselli o tab
interni. Nessun login e nessuna funzione di backup/importazione/esportazione.

## Storico sul dispositivo

IndexedDB `vialibera-progress-v1`, store `summary`, contiene un unico aggregato
aggiornato in transazione. Nessuna tabella profilo sul server, nessuna richiesta di
rete per leggere statistiche o generare consigli. Le statistiche iniziano dalle
risposte verificate dopo questa versione; le risposte ancora presenti in un quiz
ripreso possono essere recuperate dal relativo stato verificato. Nessuna promessa
di ricostruire tutte le vecchie sessioni anonime già concluse.

Limiti: 7.020 contatori per codice ufficiale, ultime 100 risposte, ultime 20 prove,
4.096 identificatori di verifica per deduplicare i replay. I replay più vecchi della
finestra recente vengono ignorati anche quando il loro identificatore è uscito
dalla coda. Non si salvano testi delle domande, figure o spiegazioni nello storico.
La cancellazione dei dati del sito o il cambio dispositivo interrompe la continuità
dei progressi. L'impossibilità di salvare viene segnalata senza bloccare i quiz.

Precisione = corrette fra le ultime 100 risposte verificate, esclusi i quesiti non
affrontati. Prima di 10 risposte viene mostrato un rapporto corrette/totale, senza
una valutazione della preparazione. Copertura = codici ufficiali distinti. I ripassi
contano come tentativi, non come nuove domande. Le simulazioni entrano nello storico
solo dopo la correzione finale; nessuna soluzione anticipata durante l'esame.
Un errore recuperato richiede due nuove risposte corrette sullo stesso quesito.
I traguardi già raggiunti rimangono sbloccati.

## Consiglio quotidiano

Il consiglio utilizza gli errori recenti per argomento, con almeno 10 risposte
complessive e 5 sul tema prima di raccomandare un punto debole. La selezione è
personale alla singola installazione, stabile durante il giorno locale e diversa
dal consiglio del giorno precedente per tema o strategia. Le strategie ruotano;
non vengono inventati errori quando mancano dati. I suggerimenti non sono una
probabilità di superamento dell'esame e non richiedono un modello AI a pagamento.
Il nuovo giorno viene rilevato sul dispositivo e al ritorno nell'app, senza cron,
notifiche o nuove scritture cloud. Ripassa 10 domande apre una serie sul tema scelto.

## Risposta automatica

In allenamento e ripasso il tocco Vero/Falso invia subito la scelta al server e apre
la spiegazione. Una verifica in corso impedisce doppi invii; un errore di rete
conserva la scelta e offre Riprova. La verifica usa un lock della sessione per
evitare risposte concorrenti diverse. Il risultato e l'istante verificato hanno un
identificatore stabile: ricaricamenti e replay non gonfiano i progressi.
La simulazione d'esame mantiene la consegna e la correzione finale.

## Sessione continua e carico database

Senza limite è l'opzione iniziale; rimangono le serie da 10, 20 e 30. Una sessione
continua usa `requested_question_count=0`, con dieci righe domanda alla volta nelle
tabelle esistenti. Dopo dieci verifiche `/api/practice/{id}/next` sostituisce quelle
righe in transazione e accumula soltanto i totali corretti/errati. Il seed funge da
versione della finestra: avanzamenti ripetuti sono idempotenti e risposte obsolete
vengono rifiutate. Si evita la ripetizione immediata della finestra precedente
quando il catalogo del tema contiene abbastanza quesiti.

Il numero visibile continua a crescere, senza nuove sessioni a ogni dieci risposte.
Il riepilogo finale copre i totali, mentre il dettaglio sul server contiene solo
l'ultima finestra. Le domande future non affrontate non contano come errori né
come non risposte. La creazione iniziale conserva i limiti antiabuso esistenti;
l'avanzamento richiede una sessione aperta e tutte le risposte verificate.
Nessuna migrazione di schema, nessuna modifica alle soluzioni ufficiali.

La selezione per argomento filtra già in PostgreSQL e l'elenco categorie aggrega
conteggi e policy immagini in una sola query, evitando di trasferire 7.020 testi
per costruire la schermata degli argomenti.

## Verifica

`tests/progress.test.ts`: deduplicazione, copertura, recupero errori, traguardi,
limiti e rotazione giornaliera. `tests/practice-continuous.test.ts`: lock concorrenti,
avanzamento idempotente, dieci righe persistite, rifiuto seed obsoleti e totali.
`tests-e2e/progress-training.spec.ts`: panoramica e dettagli senza scroll, cambio
giorno, risposta automatica, retry, ripresa, continuità oltre la decima domanda e
registrazione dei risultati esame. Tutte le prove database usano uno schema isolato.

Verifica del 24 ottobre 2026: 169 test unitari e di integrazione superati; 15
scenari browser mirati superati, comprese installazione, superfici iOS, spiegazioni,
progressi e allenamento continuo. Build di produzione, controllo TypeScript e lint
superati. Lo schema temporaneo dei test è stato eliminato dopo le verifiche.
