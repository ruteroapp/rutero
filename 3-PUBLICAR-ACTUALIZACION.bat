@echo off
chcp 65001 >nul
title Rutero - publicar actualizacion
cd /d "%~dp0"
echo.
echo  Publicar una actualizacion de Rutero
echo  ====================================
echo  Los jugadores la recibiran solos desde el boton "Buscar actualizaciones".
echo.
for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" package.json') do set ACTUAL=%%~v
echo  Version actual: %ACTUAL%
set NUEVA=
set /p NUEVA= Version nueva (pulsa Enter para publicar la %ACTUAL%): 
if "%NUEVA%"=="" set NUEVA=%ACTUAL%
if "%GH_TOKEN%"=="" set /p GH_TOKEN= Pega tu token de GitHub (permiso "repo"): 
findstr /c:"AIza" "config\cloud.json" >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta la clave del modo online ^(config\cloud.json^).
  echo  Sin ella los jugadores tendrian que pegarla a mano.
  call "%~dp00-PONER-CLAVE-ONLINE.bat" nopause
)
echo Comprobando lo necesario...
call npm install --no-audit --no-fund
call npm version %NUEVA% --no-git-tag-version --allow-same-version
call npm run publicar
if errorlevel 1 (
  echo.
  echo  ERROR: no se pudo publicar. Revisa el token y el mensaje de arriba.
  pause
  exit /b 1
)
echo.
echo  Listo. Version %NUEVA% publicada en GitHub Releases.
:fin
pause
