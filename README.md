# SNAPP · Activación fotográfica con IA

> Convierte a tus invitados en los protagonistas del evento.

App web (React + Vite) que activa la cámara del navegador, toma una foto con
cuenta regresiva, la convierte en una versión **LEGO** con IA, guarda original y
generada en **Supabase Storage** y la envía por correo al invitado.

### Proveedores de imagen (conmutables + fallback)

La generación usa una cadena de proveedores configurable por variables de
entorno (en la edge function `generate-lego`), **sin tocar código**:

| Rol | Proveedor | Modelo | Cómo se activa |
|-----|-----------|--------|----------------|
| **Principal** | Google AI Studio | Nano Banana 2 (`gemini-3.1-flash-image`) | `IMAGE_PROVIDER=google`, `GOOGLE_BACKEND=aistudio` (default) |
| Principal (alt) | Google Vertex AI | mismo modelo | `GOOGLE_BACKEND=vertex` |
| **Respaldo** | OpenAI | `gpt-image-1` | automático si Google falla o excede `IMAGE_PROVIDER_TIMEOUT_MS` |

- Para migrar de AI Studio a **Vertex**: cambia `GOOGLE_BACKEND=vertex` y agrega
  `VERTEX_PROJECT_ID`, `VERTEX_LOCATION` y `GOOGLE_SERVICE_ACCOUNT_JSON`.
- El respaldo a OpenAI se desactiva con `ENABLE_OPENAI_FALLBACK=false`.
- La columna `submissions.provider` registra qué proveedor generó cada imagen.

## Flujo

1. Se activa la cámara (Safari / Chrome / Firefox).
2. Botón **¡Sonríe!** → cuenta regresiva 3·2·1 → se toma la foto.
3. Botones **Tomar de nuevo** / **SNAPP**.
4. **SNAPP** → genera la versión LEGO (edge function `generate-lego`), guarda
   ambas imágenes en Storage y muestra el resultado en un modal.
5. **Enviar** → formulario (nombre, correo, teléfono opcional).
6. Edge function `send-photo-email` envía el correo con la foto (adjunta + enlace).

## Arquitectura

- **Frontend:** React + Vite + GSAP. Solo usa la clave `anon` (pública).
- **Secretos** (OpenRouter, SMTP, service_role) viven en las **Edge Functions**,
  nunca en el navegador.
- **Supabase:**
  - Tabla `submissions` (RLS activo; solo se accede vía service_role).
  - Buckets `originals` (privado) y `generated` (público).
  - Edge Functions `generate-lego` y `send-photo-email`.

Proyecto Supabase: `dhvyjgzxfsqaminxquuf` · https://dhvyjgzxfsqaminxquuf.supabase.co

## Métricas y base de contactos

Cada foto registra datos útiles para **mejorar el producto** y para el **cliente**:

- `captured_at` (fecha/hora de la foto), `generation_ms` (latencia IA),
  `email_ms` (latencia de correo), `provider` / `model`, `fallback_used`,
  `provider_trail`, `original_bytes` / `generated_bytes`, `user_agent`
  (dispositivo/navegador), `event_name` (segmentación por evento).

Vistas de reporte listas para consultar en el SQL Editor de Supabase:

| Vista | Para qué sirve |
|-------|----------------|
| `v_contacts` | Base de leads: nombre, correo, teléfono, evento, foto |
| `v_event_metrics` | Resumen ejecutivo por evento (totales, latencias, contactos) |
| `v_hourly_activity` | Actividad por hora → detectar horas pico |
| `v_provider_stats` | Salud técnica por proveedor/modelo (latencia, respaldo, errores) |

```sql
select * from v_event_metrics;
select * from v_contacts;
```

## Puesta en marcha (local)

```bash
npm install
cp .env.example .env.local   # ya viene con la URL y anon key del proyecto
npm run dev                  # http://localhost:5173
```

> La cámara requiere `localhost` o HTTPS. En `localhost` funciona sin más.

## Configurar los secretos de las Edge Functions

Necesarios para que **SNAPP** (IA) y el **envío de correo** funcionen:

1. Copia la plantilla y rellena los valores reales:
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env
   # edita supabase/functions/.env con tu OPENROUTER_API_KEY y SMTP_PASS
   ```
2. Súbelos a Supabase (con la CLI, ya instalada):
   ```bash
   supabase login   # una sola vez
   supabase secrets set --env-file supabase/functions/.env \
     --project-ref dhvyjgzxfsqaminxquuf
   ```
   O desde el Dashboard: **Project Settings → Edge Functions → Secrets**.

## Redesplegar Edge Functions (si cambias el código)

```bash
supabase functions deploy generate-lego   --project-ref dhvyjgzxfsqaminxquuf
supabase functions deploy send-photo-email --project-ref dhvyjgzxfsqaminxquuf
```

## Pendientes / futuras adecuaciones

- Verificar dominio en DreamHost (SPF/DKIM) para mejor entregabilidad.
- Despliegue en hosting con HTTPS (Vercel/Netlify) para uso fuera de localhost.
