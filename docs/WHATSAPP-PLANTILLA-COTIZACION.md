# Plantilla WhatsApp: cotización (`cotizacion_sisteb`)

Copia estos datos al crear la plantilla en **Meta → WhatsApp Manager → Message templates**.

## Datos de la plantilla

| Campo | Valor |
|-------|--------|
| **Nombre** | `cotizacion_sisteb` |
| **Categoría** | Utilidad |
| **Idioma** | Español (MEX) — `es_MX` |
| **Tipo** | Texto (sin encabezado ni botones) |

## Texto del cuerpo (5 variables)

Pega exactamente esto en el cuerpo del mensaje. Meta numerará las variables como `{{1}}` … `{{5}}` en el orden en que aparezcan:

```
Hola, buen día.
De parte de SISTEBIT le compartimos su cotización:

{{1}}

Número de cotización: {{2}}
Detalle: {{3}}
Total cotización: {{4}}
Fecha: {{5}}

Quedamos atentos a sus comentarios.
```

## Ejemplos para la revisión de Meta

Al enviar a revisión, Meta pide ejemplos de cada variable:

| Variable | Ejemplo |
|----------|---------|
| `{{1}}` | `• CUTTING WORKSHOP` |
| `{{2}}` | `1` |
| `{{3}}` | `2 x ALMOADILLA CANON ($1000.00) \| 1 x SERVICIO IMPRESORA ($500.00)` |
| `{{4}}` | `$1500.00 MXN` |
| `{{5}}` | `3 de junio de 2026` |

## Después de aprobar

1. Verifica que la plantilla esté en estado **Activa** (no “En revisión”).
2. (Opcional) Secreto en Supabase → Edge Functions → Secrets:
   - `WHATSAPP_TEMPLATE_COTIZACION_NAME` = `cotizacion_sisteb`
3. Despliega la función:
   ```bash
   npm run deploy:function:whatsapp
   ```
4. En la app: **Cotización → 📲 ENVIAR POR WHATSAPP**.

Si la API falla (plantilla pendiente, etc.), la app abre WhatsApp manual (`wa.me`) con el mensaje completo como respaldo.

## Relación con el código

- Edge Function: `supabase/functions/send-whatsapp-cotizacion/index.ts`
- Frontend: `src/whatsappUtils.js` → `enviarCotizacionWhatsAppCloudApi`
- Guía general: `docs/WHATSAPP-SETUP.md`
