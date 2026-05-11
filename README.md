# Sistefix Web

Aplicacion web basada en la app Android `sistefix`, con modulos principales:

- Clientes
- Servicios (Equipos)
- Reparaciones
- Ventas / Cuentas
- Inventarios
- Reportes
- Ordenes de servicio
- Catalogo de pagos
- Corte de caja

## Requisitos

- Node.js 18+

## Configuracion

1. Copia `.env.example` a `.env`.
2. Coloca tus credenciales de Supabase:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

Si no configuras Supabase, la app funciona en modo local con `localStorage`.

### GitHub Pages (Actions)

El workflow de despliegue ejecuta `npm run build` en la nube. Ahí **no existe** tu `.env`, así que debes definir los mismos valores como **secretos** del repositorio:

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (copiados de tu `.env` local).

En el panel de Supabase (**Authentication → URL configuration**), incluye el origen del sitio publicado, por ejemplo `https://systia-ai.github.io`, si tu proyecto restringe dominios.

## Ejecutar

```bash
npm install
npm run dev
```

## Build de produccion

```bash
npm run build
```
