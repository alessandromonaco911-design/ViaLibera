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

Copertura iniziale: **10 voci con confronto delle fonti / 7.020 quesiti**;
**7.010 voci ancora da redigere e revisionare**. Le dieci voci comprendono
il simbolo degli abbaglianti, la sosta negli spazi dei mezzi pubblici e otto
conversioni da km/h a distanza percorsa in un secondo. Il testo della fonte,
la corrispondenza con la figura e i calcoli sono stati confrontati da Codex;
non viene dichiarata una revisione umana o specialistica.

Per un quesito ancora non coperto, il pannello esplicita che la spiegazione è
in preparazione e mantiene l’esito ufficiale. Questo fallback non completa
l’obiettivo di avere una spiegazione didattica per ogni domanda.

`npm run explanations:audit` produce `data/reports/explanation-coverage.json`.
`node scripts/review/audit-explanations.mjs --export-drafts` prepara la coda
editoriale completa. `npm run explanations:require-complete` fallisce finché
tutti i quesiti non hanno una voce verificata: usarlo prima di dichiarare la
banca completa. Il controllo strutturale non sostituisce la revisione semantica.

## Viewport e iPhone

Il viewport dichiara `viewport-fit=cover`; i margini superiore, inferiore e
laterali derivano dalle aree sicure del dispositivo. I colori delle superfici
sono pieni, senza gradienti o filtri di sfocatura ai bordi. La modalità app
segue l’altezza del visual viewport; nel browser la guida usa le unità CSS
dinamiche, evitando una misura JavaScript rimasta indietro durante la rotazione.

I test simulano iPhone 15 a 393×852 con margini 59/34, smartphone 320×568 e
360×640 e orientamento orizzontale. Questa simulazione verifica geometria e
contenuti; non riproduce Dynamic Island o gli effetti delle barre native di
Safari. La sfumatura segnalata sul telefono resta da identificare sul dispositivo
reale: non si dichiara eliminato un effetto dell’interfaccia di iOS.
