# ViaLibera dalla schermata Home

Su smartphone, il layout principale mostra la guida all’installazione prima di
montare le sezioni interattive. La guida si può consultare anche su `/installa`.
Desktop e tablet non identificati come smartphone conservano l’accesso normale.

L’accesso mobile dipende dall’apertura in modalità `standalone`/`fullscreen` o
dal flag `navigator.standalone` di iOS. Non viene salvato un consenso in
localStorage: installare l’app o premere il pulsante di conferma non sblocca la
scheda del browser. Bisogna aprire l’icona sulla Home.

Android usa `beforeinstallprompt`, quando il browser lo rende disponibile,
con istruzioni manuali come alternativa. iPhone mostra i passaggi di Safari.
La guida gestisce annullamento, errore e completamento dell’installazione.
Il controllo è una regola di presentazione, non un sistema di autenticazione.

`src/app/manifest.ts` definisce identità, ambito e avvio dalla radice. Le icone
in `public/icons` riprendono il marchio esistente e sono rigenerabili con
`node scripts/create-app-icons.mjs`. Le sessioni richiedono Internet; questa
modifica non introduce modalità offline, notifiche o service worker.

Le preview protette da Vercel mantengono la propria autenticazione: il link di
condivisione non viene incluso nel manifest o negli asset. La conservazione
dell’accesso dopo l’installazione va verificata sul dispositivo reale.

## Verifica

`tests-e2e/install.spec.ts` copre iPhone e Android in browser, accesso diretto
alle sezioni, layout 320×568 / 360×640 / 390×844 / 667×375, richiesta di
installazione accettata o annullata, evento di installazione, riconoscimento
dell’avvio come app e assenza di blocchi su desktop. Le API di installazione e
la modalità standalone sono simulate: non sostituiscono una prova di
installazione su iPhone e Android reali.

La suite `mobile-hub.spec.ts` verifica inoltre che categorie, quiz, risultati,
swipe e navigazione esistenti continuino a funzionare.
