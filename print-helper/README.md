# SNAPP · Helper local de impresión (Canon SELPHY)

Pequeño servicio que corre en la **computadora del evento** para que la app web
pueda detectar la impresora **Canon SELPHY** e imprimir la foto con un clic.

Funciona en **Windows** (PowerShell + `mspaint`), **macOS** y **Linux** (CUPS).
No tiene dependencias: solo necesita **Node.js instalado**.

## Arrancar

**Windows:** doble clic en **`start-windows.bat`** (te avisa si falta Node.js).

**macOS:** doble clic en **`start.command`**, o en terminal:

```bash
node print-helper/server.mjs
```

Verás algo como:

```
🖨️  SNAPP print helper v1.1.0 escuchando en http://localhost:47801
    Plataforma: win32 · Herramienta: PowerShell
    Buscando impresora que contenga: "selphy"
    ✅ Detectada: Canon SELPHY CP1500 (lista)
```

## Diagnóstico rápido

Abre en **Chrome** la pantalla de diagnóstico de la app:

```
https://<tu-app>/#/impresora      (o  http://localhost:5180/#/impresora  en local)
```

Muestra un checklist en vivo: si el helper responde, el sistema/herramienta, si
la SELPHY fue detectada, su estado, y **todas** las impresoras encontradas (útil
si el nombre no coincide con «selphy»). Incluye un botón para **imprimir una
página de prueba**.

## Cómo lo usa la app

- La app consulta `http://localhost:47801/status`. Si la SELPHY está conectada,
  muestra el botón **Imprimir** en el modal de resultado (una sola copia).
- Al imprimir, la app envía la imagen a `http://localhost:47801/print`, y el
  helper la manda a la impresora:
  - **Windows:** `print-image.ps1` (System.Drawing / GDI+) — impresión directa,
    determinista y sin abrir Paint. Auto-rota y ajusta la foto a la postal.
  - **macOS/Linux:** `lp` (CUPS).
- Los trabajos se **serializan** (uno tras otro) y tienen **timeout**, así dos
  impresiones no se enciman ni se cuelgan.

> La SELPHY (sublimación) tarda ~1 minuto en sacar cada foto: es normal que el
> display diga «Procesando» un rato. El helper responde en cuanto encola el
> trabajo; la impresora termina sola.

## Importante (navegador)

La app publicada corre en **HTTPS** (GitHub Pages) y llama a `http://localhost`.
Chrome lo permite (considera `localhost` seguro); **usa Chrome** para el kiosco.
Safari puede bloquearlo.

## Solución de problemas

| Síntoma en `#/impresora` | Causa probable | Solución |
|---|---|---|
| «Helper no accesible» | El helper no está corriendo o no es Chrome | Arranca `start-windows.bat`; usa Chrome; verifica Node.js (`node -v`) |
| Herramienta no disponible | PowerShell no responde (Windows) | Verifica que PowerShell funcione en esa PC |
| SELPHY no detectada | El nombre de la cola no contiene «selphy» | Renombra la impresora, o arranca con `SELPHY_MATCH` (ver abajo) |
| Detectada pero «no lista» | Impresora apagada / sin papel / offline | Enciende y revisa la SELPHY |

### Ajustar el nombre a buscar (Windows)

Si tu impresora se llama, por ejemplo, `Canon CP1500`, arranca así (cmd):

```bat
set SELPHY_MATCH=cp1500
node server.mjs
```

## Configuración (opcional, variables de entorno)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `47801` | Puerto del helper |
| `SELPHY_MATCH` | `selphy` | Texto que debe contener el nombre de la impresora |
| `PRINT_OPTIONS` | `fit-to-page` | Opciones de `lp` (solo macOS/Linux) |
| `PRINT_CMD_WIN` | (vacío) | Comando propio de impresión en Windows (plantilla `{file}`/`{printer}`). Si se define, reemplaza a `print-image.ps1` |
| `PRINT_TIMEOUT_MS` | `90000` | Tiempo máx. por trabajo antes de reportar error |
| `DETECT_TTL_MS` | `8000` | Vida de la caché de detección de impresoras (ver abajo) |
| `ALLOW_ORIGIN` | `*` | Origen permitido (CORS) |

### Sobre la caché de detección

Listar impresoras en Windows lanza un proceso de PowerShell y tarda ~4 s. El
helper cachea el resultado, así que `/status` (el que consulta el kiosco cada
10 s) responde en milisegundos. `/diag` y `/print` **siempre** consultan el
estado real, sin caché.

## Endpoints

- `GET /status` → `{ connected, printer, detail }`
- `GET /diag` → diagnóstico completo `{ platform, tool, toolAvailable, match, printers, matched, connected, port, version }`
- `POST /print` → body `{ imageUrl }` ó `{ imageBase64 }`
