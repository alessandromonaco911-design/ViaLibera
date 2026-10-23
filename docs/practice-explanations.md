# Spiegazioni dell’allenamento

Dopo la verifica, un pannello mostra esito, soluzione, spiegazione editoriale,
promemoria e fonte. Si può chiudere, riaprire e avanzare esplicitamente; l’ultima
domanda apre la conferma di completamento. I testi lunghi hanno pagine brevi,
con pulsanti precedenti/successive, senza richiedere scroll verticale.

La modalità simulazione non anticipa spiegazioni o soluzioni. In allenamento,
il server le restituisce solo dopo la verifica della relativa domanda, incluso
il replay idempotente e la ripresa di una risposta già verificata.

## Banca editoriale e copertura

`src/data/practice-explanations.json` è una banca redazionale, non un listato
ministeriale di spiegazioni. Una voce è vincolata all’hash di testo, risposta
e immagine: cambiare uno di questi elementi rende la vecchia spiegazione
inapplicabile. Il server non restituisce bozze o voci prive di verifica.

La copertura si misura con `npm run explanations:require-complete`: deve
controllare tutti i **7.020 quesiti** del catalogo attivo. Otto coppie hanno
testo, soluzione e figura identici: condividono una voce e conservano tutti
i codici ufficiali in `officialQuestionCodes`. La banca completa contiene
quindi **7.012 contenuti distinti**.

Le spiegazioni sono redatte e controllate da Codex, con revisione semantica
dei veri e dei falsi, controllo delle figure e correzioni per singolo codice.
La fonte del VERO/FALSO è il PDF AB del Portale, snapshot verificato il
22 ottobre 2026. Le motivazioni sono editoriali: una proposizione ufficiale
citata prova l’esito, ma non equivale da sola a una fonte indipendente per
ogni inferenza tecnica. Il metodo di verifica distingue questi casi. Non si
dichiara una firma umana, una certificazione specialistica o validità futura
per il 2027.

Per le vecchie sessioni, una versione del quesito modificata o rimossa può
non avere una spiegazione compatibile: il pannello lo dichiara e conserva
l’esito del catalogo di quella sessione. Non si riutilizza una motivazione
associata a una figura o soluzione diversa.

`npm run explanations:audit` produce `data/reports/explanation-coverage.json`.
`node scripts/review/audit-explanations.mjs --export-drafts` prepara la coda
editoriale completa. `npm run explanations:require-complete` fallisce finché
tutti i quesiti non hanno una voce verificata: usarlo prima di dichiarare la
banca completa. Il controllo strutturale non sostituisce la revisione semantica.

`scripts/review/collect-explanation-drafts.mjs` raccoglie le bozze e ne
controlla identificatori, testi e immagini senza approvarle. Il comando
`scripts/review/publish-explanations.mjs --review=<file> --require-complete --write`
accetta esclusivamente voci con revisione esplicita e impronta della copia
controllata. Rifiuta bozze, cambi di testo successivi alla revisione, fonti
non ammesse e una copertura incompleta delle approvazioni stesse.

## Formulazioni da contestualizzare

Gli esiti ministeriali non vengono modificati. Alcuni quesiti richiedono
però di distinguere il contenuto del quiz dalla condotta reale:

- **24883, emorragia e acqua:** il listato assegna FALSO, mentre la
  [Croce Rossa](https://cri.it/cosa-facciamo/salute/primo-soccorso/pillole-di-primo-soccorso/emorragie)
  indica di non somministrare cibo o bevande. Il pannello rende esplicita
  questa differenza e non invita a far bere il traumatizzato.
- **24915, ferita toracica:** la compressione del sanguinamento non va
  trasformata in sigillatura di una ferita aperta. La fonte visibile rinvia
  alle [linee guida ERC 2025](https://www.erc.edu/media/i2vllpae/gl2025-12-faid-e.pdf).
- **24366, airbag e seggiolino:** viene spiegato il caso del seggiolino
  rivolto all’indietro, evitando di generalizzare l’obbligo a ogni posizione.
- **22934, inversione:** la formulazione ambigua del listato non deve
  insegnare a omettere il controllo della mezzeria. La spiegazione ribadisce
  che la continua non si attraversa.

Questi casi sono registrati anche in `verification.catalogueDiscrepancy`.
Le fonti sanitarie aggiuntive non vengono attribuite al Ministero dei trasporti.

## Viewport e iPhone

Il viewport dichiara `viewport-fit=cover`; i margini superiore, inferiore e
laterali derivano dalle aree sicure del dispositivo. I colori delle superfici
sono pieni, senza gradienti o filtri di sfocatura ai bordi. La modalità app
segue l’altezza del visual viewport; nel browser la guida usa le unità CSS
dinamiche, evitando una misura JavaScript rimasta indietro durante la rotazione.

I test simulano iPhone 15 a 393×852 con margini 59/34, smartphone 320×568 e
360×640 e orientamento orizzontale. Questa simulazione verifica geometria e
contenuti; non riproduce Dynamic Island o gli effetti delle barre native di
Safari. Header e navigazione opachi sono ancorati ai bordi del viewport per
evitare l’effetto scroll-edge nativo di WebKit. Dopo il rilascio della
correzione, l’utente ha confermato il funzionamento sul proprio iPhone.
