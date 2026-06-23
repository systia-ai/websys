/**
 * Corrige fecha_ingreso en todas las órdenes: debe coincidir con fecha_creacion.
 * Uso: npx dotenv -e .env -- node scripts/corregir-fecha-ingreso-ordenes.mjs
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbUrl = process.env.SUPABASE_DB_URL?.trim()

if (!dbUrl) {
  console.error('Falta SUPABASE_DB_URL en .env')
  process.exit(1)
}

function runSql(sql) {
  const oneLine = sql.replace(/\s+/g, ' ').trim()
  const escapedUrl = dbUrl.replace(/"/g, '\\"')
  const escapedSql = oneLine.replace(/"/g, '\\"')
  execSync(`npx supabase db query "${escapedSql}" --db-url "${escapedUrl}" -o table --agent no`, {
    stdio: 'inherit',
    cwd: root,
    shell: true,
    env: process.env,
  })
}

console.log('--- Orden 540 (antes) ---')
runSql(
  "SELECT id, estatus, fecha_creacion::date AS creacion, fecha_ingreso, fecha_revision FROM public.reparaciones WHERE id = 540",
)

console.log('\n--- Órdenes con fecha_ingreso distinta a creación (muestra) ---')
runSql(
  `SELECT id, fecha_creacion::date AS creacion, fecha_ingreso FROM public.reparaciones WHERE fecha_creacion IS NOT NULL AND fecha_ingreso IS DISTINCT FROM (fecha_creacion AT TIME ZONE 'UTC')::date ORDER BY id DESC LIMIT 15`,
)

console.log('\n--- Corrigiendo todas las órdenes web (≥ 2026-05-01) ---')
runSql(
  `UPDATE public.reparaciones SET fecha_ingreso = (fecha_creacion AT TIME ZONE 'UTC')::date WHERE fecha_creacion IS NOT NULL AND (fecha_creacion AT TIME ZONE 'UTC')::date >= '2026-05-01' AND (fecha_ingreso IS NULL OR fecha_ingreso IS DISTINCT FROM (fecha_creacion AT TIME ZONE 'UTC')::date)`,
)

console.log('\n--- Orden 540 (después) ---')
runSql(
  "SELECT id, estatus, fecha_creacion::date AS creacion, fecha_ingreso, fecha_revision FROM public.reparaciones WHERE id = 540",
)

console.log('\n--- Total aún desalineadas ---')
runSql(
  `SELECT COUNT(*) AS pendientes FROM public.reparaciones WHERE fecha_creacion IS NOT NULL AND fecha_ingreso IS DISTINCT FROM (fecha_creacion AT TIME ZONE 'UTC')::date`,
)

console.log('\nListo.')
