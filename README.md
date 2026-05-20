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

### Acceso seguro (Auth + RLS)

Con Supabase configurado, la app pide **correo y contraseña** (usuarios creados en el Dashboard).  
La base exige sesión autenticada para leer/escribir datos. Guía completa: [docs/SEGURIDAD-AUTH-RLS.md](docs/SEGURIDAD-AUTH-RLS.md).

Tras clonar o actualizar, aplica la migración RLS:

```bash
supabase db push
```

### GitHub Pages (Actions)

El workflow de despliegue ejecuta `npm run build` en la nube. Ahí **no existe** tu `.env`, así que debes definir los mismos valores como **secretos** del repositorio:

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (copiados de tu `.env` local).

En el panel de Supabase (**Authentication → URL configuration**), configura Site URL y Redirect URLs del sitio publicado, por ejemplo `https://TU_USUARIO.github.io/websys/` (ver [docs/SEGURIDAD-AUTH-RLS.md](docs/SEGURIDAD-AUTH-RLS.md)).

## Ejecutar

```bash
npm install
npm run dev
```

## Build de produccion

```bash
npm run build
```
