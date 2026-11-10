#!/bin/bash
# Instala el print helper de SNAPP como servicio de macOS (LaunchAgent):
# arranca solo al iniciar sesión y se reinicia si se cae.
# Para quitarlo: ./install-mac-autostart.command uninstall
set -e
LABEL="lat.mayam.snapp-print-helper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [ "$1" = "uninstall" ]; then
  rm -f "$PLIST"
  echo "Servicio eliminado."
  exit 0
fi

NODE="$(command -v node || true)"
[ -z "$NODE" ] && for p in /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$p" ] && NODE="$p"; done
[ -z "$NODE" ] && { echo "No encontré node. Instálalo y vuelve a correr esto."; exit 1; }

# Detener una copia manual que ya esté ocupando el puerto 47801
pkill -f "node .*print-helper/server.mjs" 2>/dev/null || pkill -f "node server.mjs" 2>/dev/null || true
sleep 1

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/server.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/snapp-print-helper.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/snapp-print-helper.log</string>
</dict>
</plist>
EOF

launchctl bootstrap "$DOMAIN" "$PLIST"
sleep 2
echo "Estado del helper:"
curl -s -m 3 http://localhost:47801/status || echo "(no responde aún; revisa ~/Library/Logs/snapp-print-helper.log)"
echo
echo "Listo. El helper arrancará solo cada vez que inicies sesión."
