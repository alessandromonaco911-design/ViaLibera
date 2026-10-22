# Aggiornamento Neon del 22 ottobre 2026

Il database remoto configurato è stato aggiornato dopo il backup completo
`test-output/neon-before-update-2026-10-22T20-07-44-145Z.dump` (1.058.289 byte).
Il backup è stato ripristinato in un PostgreSQL 18 temporaneo senza porte pubblicate;
le impronte delle 21 sessioni e delle 550 righe associate coincidono. Il container
di prova è stato rimosso e il backup conservato localmente, fuori dal repository.

Applicata la migrazione additiva 0007 dei contatori di creazione. Importata in
transazione la versione AB `observed-2026-10-22`: 7.020 quesiti, 407 immagini e
3.919 associazioni. Il confronto completo con lo snapshot verificato non rileva
differenze. L’importatore usa lotti di 500 righe per ridurre i round trip sul
database remoto; rollback e idempotenza sono verificati anche su fixture locali
che attraversano più lotti.

Il catalogo precedente da 7.106 quesiti è conservato e coincide integralmente con
il suo corpus verificato. Il controllo ha rilevato un riferimento alla fonte nullo,
preesistente su Neon: dopo la verifica dell’hash del PDF e di tutti i contenuti,
è stato collegato al record sorgente già presente e registrato il metodo di
riconciliazione nei metadati. Nessuna modifica a testi, risposte o ordine di importazione.
Anche il controllo storico completo ora passa.

Dopo l’aggiornamento, le impronte di sessioni e risposte coincidono con quelle del
backup. Non sono state importate le sessioni locali, né effettuate pulizie sul remoto.
La configurazione `.env` continua a puntare al database locale; `.env.neon` resta
un segreto locale escluso da Git. Tutte le modifiche del sito sono preparate sul
ramo `codex/vialibera-preview` per la preview Vercel tramite l’integrazione GitHub
già esistente.

Prove locali, escluse da Git: `test-output/neon-backup-verification.txt`,
`test-output/neon-migration.txt`, `test-output/neon-import-apply.txt`,
`test-output/neon-verification-new.txt`, `test-output/neon-verification-history.txt`,
`test-output/neon-history-preservation.json`.
