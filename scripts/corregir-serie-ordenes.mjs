/**
 * Corrige serie de equipo en órdenes 514 y 537.
 * Uso: npx dotenv -e .env -- node scripts/corregir-serie-ordenes.mjs
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

const correcciones = [
  { orden: 514, serie: 'X8G5124559' },
  { orden: 537, serie: 'X8G50229803' },
]

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

console.log('--- Estado actual ---')
runSql(
  'SELECT r.id AS orden_id, r.equipo_id, e.serie AS serie_actual FROM public.reparaciones r LEFT JOIN public.equipos e ON e.id = r.equipo_id WHERE r.id IN (514, 537) ORDER BY r.id',
)

for (const { orden, serie } of correcciones) {
  console.log(`\n--- Actualizando orden ${orden} → ${serie} ---`)
  runSql(
    `UPDATE public.equipos e SET serie = '${serie}' FROM public.reparaciones r WHERE r.id = ${orden} AND r.equipo_id = e.id`,
  )
}

console.log('\n--- Verificación final ---')
runSql(
  'SELECT r.id AS orden_id, r.equipo_id, e.serie AS serie_corregida FROM public.reparaciones r LEFT JOIN public.equipos e ON e.id = r.equipo_id WHERE r.id IN (514, 537) ORDER BY r.id',
)

console.log('\nListo.')
