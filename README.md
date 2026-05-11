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

## Ejecutar

```bash
npm install
npm run dev
```

## Build de produccion

```bash
npm run build
```
