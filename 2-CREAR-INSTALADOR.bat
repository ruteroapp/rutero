@echo off
chcp 65001 >nul
title Rutero - crear instalador
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instalando Node.js ^(solo la primera vez^)...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo Cierra esta ventana y vuelve a abrir este archivo.
  pause
  exit /b
)
findstr /c:"AIza" "config\cloud.json" >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta la clave del modo online ^(config\cloud.json^).
  echo  Sin ella los jugadores tendrian que pegarla a mano.
  call "%~dp00-PONER-CLAVE-ONLINE.bat" nopause
)
echo Comprobando lo necesario...
call npm install --no-audit --no-fund
echo Creando el instalador de Rutero...
call npm run dist
if errorlevel 1 (
  echo.
  echo  ERROR: no se pudo crear el instalador. Mira el mensaje de arriba.
  echo  Si sale algo de "node_modules", borra esa carpeta y vuelve a abrir este archivo.
  pause
  exit /b 1
)
echo.
echo Listo: el instalador esta en la carpeta "dist"
start "" "%~dp0dist"
pause
