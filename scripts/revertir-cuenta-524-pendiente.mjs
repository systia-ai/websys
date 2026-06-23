/**
 * Cuenta 524 / Orden 513 (Ma Concepción) — volver a PENDIENTE para liquidar manualmente.
 * Uso: npx dotenv -e .env -- node scripts/revertir-cuenta-524-pendiente.mjs
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

console.log('--- Antes ---')
runSql(
  'SELECT c.id AS cuenta, c.estatus AS cuenta_estatus, c.total, c.saldo, c.fecha_liquidada, r.id AS orden, r.estatus AS orden_estatus, r.tipo_reparacion FROM public.cuentas c LEFT JOIN public.reparaciones r ON r.id = c.repara_id WHERE c.id = 524',
)

console.log('\n--- Cuenta 524 → PENDIENTE ($0) ---')
runSql(
  "UPDATE public.cuentas SET estatus = 'PENDIENTE', total = 0, saldo = 0, fecha_liquidada = NULL WHERE id = 524 AND repara_id = 513",
)

console.log('\n--- Orden 513 → REPARADO (garantía, lista para liquidar) ---')
runSql(
  "UPDATE public.reparaciones SET estatus = 'REPARADO', fecha_entrega = NULL, verificado_entrega = COALESCE(verificado_entrega, false), updated_at = NOW() WHERE id = 513 AND tipo_reparacion ILIKE '%GARANTIA EPSON%'",
)

console.log('\n--- Después ---')
runSql(
  'SELECT c.id AS cuenta, c.estatus AS cuenta_estatus, c.total, c.saldo, c.fecha_liquidada, r.id AS orden, r.estatus AS orden_estatus, r.tipo_reparacion FROM public.cuentas c LEFT JOIN public.reparaciones r ON r.id = c.repara_id WHERE c.id = 524',
)
