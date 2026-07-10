# SNAPP · Helper local de impresión (Canon SELPHY)

Pequeño servicio que corre en la **Mac del evento** para que la app web pueda
detectar la impresora **Canon SELPHY** e imprimir la foto con un clic.

No tiene dependencias (solo Node.js, que ya tienes instalado).

## Arrancar

```bash
node print-helper/server.mjs
```

Verás algo como:

```
🖨️  SNAPP print helper escuchando en http://localhost:47801
    ✅ Detectada: Canon_SELPHY_CP1500 (lista)
```

> En Mac también puedes hacer doble clic en **`start.command`** (dentro de esta carpeta).

## Cómo lo usa la app

- La app consulta `http://localhost:47801/status`. Si la SELPHY está conectada,
  muestra el botón **Imprimir** en el modal de resultado.
- Al imprimir, la app envía la URL de la foto a `http://localhost:47801/print`,
  y el helper la manda a la impresora con `lp`.

## Importante (navegador)

La app publicada corre en **HTTPS** (GitHub Pages) y llama a `http://localhost`.
Chrome permite esto (considera `localhost` seguro); **usa Chrome** para el kiosco.
Safari puede bloquearlo — si usas Safari, abre la app localmente por `http://`.

## Configuración (opcional, variables de entorno)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `47801` | Puerto del helper |
| `SELPHY_MATCH` | `selphy` | Texto que debe contener el nombre de la impresora |
| `PRINT_OPTIONS` | `fit-to-page` | Opciones de `lp` (separadas por coma) |
| `ALLOW_ORIGIN` | `*` | Origen permitido (CORS) |

Ejemplo:

```bash
PRINT_OPTIONS=fit-to-page,media=Postcard node print-helper/server.mjs
```

## Endpoints

- `GET /status` → `{ connected, printer, detail }`
- `POST /print` → body `{ imageUrl }` ó `{ imageBase64 }`
