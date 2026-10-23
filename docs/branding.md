# Marchio e apertura ViaLibera

Direzione approvata: logo B (semaforo verde), intro A (macchinina al rosso,
frenata morbida e ripartenza al verde), cover del link con il nuovo marchio.

## Asset condivisi

Il disegno sorgente è `public/brand/traffic-light.svg`. Il componente `Brand`
affianca al simbolo il nome ViaLibera. Negli header quiz sotto 560 px compare
solo il simbolo, con nome accessibile sul link, per lasciare spazio ai comandi.

`node scripts/create-app-icons.mjs` rigenera icone PNG, favicon, cover statica
1200×630 e sei immagini statiche di avvio iOS. Le icone hanno fondo giallo e il
simbolo rimane nell'area sicura anche nella variante maskable. La cover mantiene
il testo approvato «La patente. Un quiz alla volta.» I metadati Open Graph e
Twitter sono nel layout server e l'immagine ha un percorso pubblico versionato.

## Intro

L'intro si monta nel wrapper persistente della app installata, soltanto quando
si apre la home. La chiave sessionStorage `vialibera:intro:traffic-light:v1`
evita replay su ricaricamenti e navigazioni della stessa sessione. Rientri dal
background non la rilanciano. I link diretti a quiz o allenamenti non la mostrano.
Con movimento ridotto si entra direttamente nella pagina.

Sequenza CSS: arrivo e arresto, piccolo assestamento della carrozzeria, rosso
spento e verde acceso, ripartenza e dissolvenza. Fine a 1600 ms, timeout di
sicurezza a 1700 ms; il pulsante «Entra subito» permette di saltarla. Il contenuto
si monta subito sotto l'overlay e diventa interattivo all'uscita. Solo transform
e opacity per il movimento, nessuna dipendenza di animazione o audio.

L'apertura nativa di iOS rimane distinta dall'animazione web: le immagini
`apple-touch-startup-image` sono statiche. Sono incluse le misure CSS 375×812,
390×844 e 393×852 a DPR 3, in entrambi gli orientamenti; altri schermi usano il
comportamento del sistema. Si mantengono viewport, safe area e status bar già
funzionanti. [Meccanismo Apple delle schermate di avvio](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

Le app di messaggistica scelgono la resa della preview e possono memorizzarla.
L'aggiornamento di un'icona già installata è gestito dal dispositivo: non viene
promesso un refresh immediato delle installazioni precedenti.

## Verifica

`tests-e2e/branding.spec.ts` controlla metadati senza JavaScript, disponibilità
degli asset, stati rosso/verde, uscita e skip, assenza di replay, movimento ridotto,
link diretti e viewport compatti/orizzontali. I test browser simulano la modalità
standalone; non riproducono l'animazione di sistema o la cache delle icone iOS.

Verifica del 23 ottobre 2026: build isolata, TypeScript e lint riusciti; 13
scenari browser superati fra branding, installazione, superfici iOS e spiegazioni.
Controllati 320×568, 393×852 e 852×393, inclusi header esame/allenamento e
testi lunghi delle spiegazioni. Schema di prova separato rimosso a fine verifica.
