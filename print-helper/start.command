#!/bin/bash
# Doble clic para arrancar el helper de impresión de SNAPP en la Mac.
cd "$(dirname "$0")"
echo "Iniciando SNAPP print helper…"
node server.mjs
