@echo off
chcp 65001 >nul
title Rutero - clave del modo online
cd /d "%~dp0"
echo.
echo  Clave del modo online (Firebase)
echo  ================================
echo  Firebase ^> Configuracion del proyecto ^> General ^> Tus apps ^> apiKey
echo  Empieza por AIza... Se guarda en config\cloud.json y va dentro del instalador,
echo  asi los jugadores solo tienen que crear su cuenta con correo y contrasena.
echo.
set /p KEY= Pega la apiKey y pulsa Enter: 
if "%KEY%"=="" goto fin
> "config\cloud.json" echo {"apiKey":"%KEY%","projectId":"rutero-a0abb"}
echo  Guardado en config\cloud.json
:fin
if not "%1"=="nopause" pause
