# Risultati e attese

Il risultato mobile mostra subito la lista di quesiti, esito scritto, risposta
data e soluzione. Solo la lista scorre: intestazione, filtri, azione e navigazione
restano fuori dall'area scorrevole. Le figure si possono aprire a piena dimensione.
I filtri sono controlli ordinari, senza swipe o caroselli annidati. Le domande
saltate sono distinte dalle risposte errate; nell'esame entrambe concorrono al
numero totale di errori. Nel continuo i totali coprono tutta la sessione, mentre
la lista dichiara la disponibilità del solo ultimo blocco e conserva la numerazione
complessiva. Non viene creata altra cronologia sul database.

## Come si accompagnano le attese

- Le destinazioni quiz e risultato hanno fallback strutturali: marchio, superfici
  e spazi riservati, invece di cambiare l'intera pagina in una scritta e uno spinner.
  Anche la prima idratazione della navigazione mobile usa la struttura dell'app.
- Il pannello spiegazione si apre al tocco Vero/Falso in stato neutro. Non rivela
  soluzione o esito prima della risposta del server. Poi aggiorna lo stesso pannello.
  In caso di errore conserva la scelta e mantiene il normale tentativo di ripetizione.
- Avvio, ripresa, ripasso, nuovo blocco e consegna sono accompagnati da un'unica
  superficie con la macchinina: rimane montata durante la richiesta API e durante
  l'apertura della destinazione. Viene scoperto il contenuto solo quando il suo
  componente reale è montato, con una dissolvenza di 150 ms e interazioni subito
  disponibili. Nessun tempo minimo di permanenza o percentuale inventata.
  Errori e il comando Mostra la pagina possono chiuderla; non annullano richieste
  già inviate. I loop si fermano a pagina nascosta e con movimento ridotto.
- I segnaposto animati rispettano la preferenza di movimento ridotto; non vengono
  aggiunte attese minime, finte percentuali o completamenti ottimistici.
- Le prossime due figure del quiz vengono precaricate e decodificate a priorità
  bassa. Nessun caricamento dell'intero catalogo; il risparmio dati disattiva l'anticipo.
- I filtri dei risultati desktop aggiornano lo stato e l'URL con History API,
  senza ripetere la navigazione server e la lettura database per dati già presenti.
- Le letture indipendenti di domande e argomento nell'allenamento avvengono in
  parallelo dopo la validazione della sessione.

Le misure visive migliorano la continuità percepita; immagini anticipate, filtri
locali e letture parallele eliminano o anticipano lavoro reale. Non promettono
assenza di latenza su una rete lenta.
Nessuna dipendenza, migrazione o chiamata AI aggiunta.

## Spiegazioni nei risultati

Un pannello già aperto sotto le risposte mostra il testo verificato, il promemoria
e la fonte. La banca rimane sul server: viene trasmessa soltanto la spiegazione
dei quesiti della sessione completata, anche per domande saltate. Il risultato
dell'esame viene arricchito dopo il controllo dello stato finale. Se il testo
non corrisponde alla versione del quesito, compare il fallback esplicito.

## Verifica

`tests-e2e/results-smooth.spec.ts` copre lista immediata, filtri, scroll confinato,
320/360/393 px e landscape con safe area, continuo, attesa di verifica trattenuta
artificialmente, filtri desktop senza richieste RSC e conteggio esame con domande
saltate. Gli altri scenari mirati verificano spiegazioni, progressi e installazione.
I test di geometria attendono due frame dopo il cambio viewport affinché l'evento
visualViewport e le container query abbiano assunto le nuove dimensioni.

Verifica del 26 ottobre 2026: 31 test di servizio e spiegazioni e 23 scenari browser
mirati superati; build di produzione, TypeScript e lint riusciti. La superficie
animata è verificata trattenendo separatamente risposta API e risposta RSC, con
controllo del movimento effettivo, modalità ridotta, viewport e recupero da errore.
La banca è presente nei chunk server e assente nei chunk client. Test database
nello schema temporaneo dedicato.
