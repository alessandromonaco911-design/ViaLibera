@echo off
setlocal enabledelayedexpansion
title ViaLibera - Avvio / Riavvio applicazione
cd /d "%~dp0"

REM ============================================================
REM  Uso:
REM   avvia-app.bat             avvia il frontend in PRODUZIONE
REM                             (build + start: stabile e veloce)
REM   avvia-app.bat --dev       avvia il dev server (hot reload)
REM   avvia-app.bat --clean     cancella la cache .next prima di
REM                             avviare (consigliato dopo aggiornamenti)
REM ============================================================

set MODE=prod
set CLEAN=0
if /i "%~1"=="--dev" set MODE=dev
if /i "%~1"=="--clean" set CLEAN=1
if /i "%~2"=="--dev" set MODE=dev
if /i "%~2"=="--clean" set CLEAN=1

echo ============================================
echo   ViaLibera - Avvio / Riavvio applicazione
echo ============================================
echo.

REM ---------------------------------------------------------------
REM 0. Pulizia cache richiesta
REM ---------------------------------------------------------------
if "%CLEAN%"=="1" (
  echo [CACHE] Cancello la cache .next...
  if exist ".next" (
    rmdir /s /q ".next"
    echo [OK] Cache .next eliminata.
  ) else (
    echo [OK] Nessuna cache presente.
  )
  echo.
)

REM ---------------------------------------------------------------
REM 1. Verifica Node.js
REM ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] Node.js non trovato. Installalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------
REM 2. Verifica dipendenze installate
REM ---------------------------------------------------------------
if not exist "node_modules" (
  echo [INFO] node_modules mancante: eseguo npm install...
  call npm install
  if errorlevel 1 (
    echo [ERRORE] npm install fallito.
    pause
    exit /b 1
  )
)

REM ---------------------------------------------------------------
REM 3. Verifica / avvio Docker Desktop
REM ---------------------------------------------------------------
docker info >nul 2>nul
if errorlevel 1 (
  echo [INFO] Docker Desktop non attivo: lo avvio...
  if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  ) else (
    echo [ERRORE] Docker Desktop non trovato. Avvialo manualmente.
    pause
    exit /b 1
  )
  echo [ATTESA] In attesa di Docker Desktop, max 120s...
  set /a wait=0
  :wait_docker
  set /a wait+=5
  if !wait! gtr 120 (
    echo [ERRORE] Docker Desktop non si e' avviato in tempo.
    pause
    exit /b 1
  )
  timeout /t 5 /nobreak >nul
  docker info >nul 2>nul
  if errorlevel 1 goto wait_docker
  echo [OK] Docker Desktop attivo.
)

REM ---------------------------------------------------------------
REM 4. Avvio / verifica container PostgreSQL
REM ---------------------------------------------------------------
echo [DB] Avvio container PostgreSQL...
docker compose up -d >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] Impossibile avviare il container PostgreSQL.
  echo        Verifica che i file docker-compose.yml e .env esistano.
  pause
  exit /b 1
)

set DBSTATE=starting
set /a wait=0
:wait_db
set /a wait+=3
if !wait! gtr 60 (
  echo [AVVISO] Il database non risulta healthy in tempo, ma provo comunque.
  goto db_ready
)
timeout /t 3 /nobreak >nul
for /f "delims=" %%s in ('docker inspect --format="{{.State.Health.Status}}" scuolaguida-postgres 2^>nul') do set DBSTATE=%%s
if not "!DBSTATE!"=="healthy" goto wait_db
:db_ready
echo [OK] Database pronto (porta 5433).

REM ---------------------------------------------------------------
REM 5. Controllo porta 3000: server gia' attivo?
REM ---------------------------------------------------------------
set PORT_PID=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING" 2^>nul') do set PORT_PID=%%p

if defined PORT_PID (
  echo.
  echo [INFO] Il frontend risulta gia' in esecuzione sulla porta 3000, PID !PORT_PID!.
  choice /c SN /n /m "Vuoi riavviarlo? [S]i oppure [N]o: "
  if errorlevel 2 (
    echo [OK] Lascio il server attivo. Apro il browser...
    start "" "http://localhost:3000"
    echo.
    echo Per fermarlo in seguito: termina il processo PID !PORT_PID!.
    pause
    exit /b 0
  )
  echo [INFO] Termino il processo PID !PORT_PID!...
  taskkill /PID !PORT_PID! /F >nul 2>nul
  timeout /t 2 /nobreak >nul
)

REM ---------------------------------------------------------------
REM 6. Avvio frontend e apertura browser
REM ---------------------------------------------------------------
if "%MODE%"=="prod" (
  echo.
  echo [OK] Modalita' PRODUZIONE.
  echo      Verifico/creo la build di produzione...
  call npm run build
  if errorlevel 1 (
    echo [ERRORE] Build fallita.
    pause
    exit /b 1
  )
  echo [OK] Avvio il server su http://localhost:3000
  echo      - Per fermarlo: premi Ctrl+C in questa finestra
  echo      - Per riavviarlo: chiudi e riesegui avvia-app.bat
) else (
  echo.
  echo [OK] Modalita' SVILUPPO (hot reload).
  echo      Avvio il frontend su http://localhost:3000
  echo      - Per fermarlo: premi Ctrl+C in questa finestra
  echo      - Se vedi errori di hydration o compilazioni strane,
  echo        riesegui con: avvia-app.bat --clean
)

echo.
echo Apro il browser tra pochi secondi...
if /i "%VIALIBERA_SKIP_BROWSER%"=="1" (
  echo [TEST] Apertura browser disabilitata, VIALIBERA_SKIP_BROWSER=1.
  goto run_app
)
start "" cmd /c "timeout /t 4 /nobreak >nul & start "" http://localhost:3000"
:run_app

if "%MODE%"=="prod" (
  call npm run start
) else (
  call npm run dev
)

echo.
echo Il server si e' fermato.
pause
exit /b 0
