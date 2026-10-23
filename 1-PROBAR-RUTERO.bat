@echo off
chcp 65001 >nul
title Rutero - probar
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instalando Node.js ^(solo la primera vez^)...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js instalado. Cierra esta ventana y vuelve a abrir este archivo.
  pause
  exit /b
)
(
  echo Comprobando lo necesario ^(la primera vez tarda un par de minutos^)...
  call npm install --no-audit --no-fund
)
call npm start
