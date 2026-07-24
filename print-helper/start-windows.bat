@echo off
REM Doble clic para arrancar el helper de impresion de SNAPP en Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js no esta instalado.
  echo Instalalo desde https://nodejs.org  ^(version LTS^) y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

echo Iniciando SNAPP print helper...
node server.mjs

echo.
echo El helper se detuvo. Revisa los mensajes de arriba.
pause
