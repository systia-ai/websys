/**
 * Marca ENTREGADO las órdenes cuya cuenta ya está LIQUIDADA.
 * Uso: npx dotenv -e .env -- node scripts/corregir-ordenes-cuenta-liquidada.mjs
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

console.log('--- Órdenes desalineadas (cuenta LIQUIDADA, orden no ENTREGADO) ---')
runSql(
  `SELECT r.id, r.estatus, r.tipo_reparacion, c.estatus AS cuenta, c.fecha_liquidada FROM public.reparaciones r INNER JOIN public.cuentas c ON c.repara_id = r.id WHERE UPPER(TRIM(COALESCE(c.estatus, ''))) = 'LIQUIDADA' AND UPPER(TRIM(COALESCE(r.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA') ORDER BY r.id`,
)

console.log('\n--- Corrigiendo ---')
runSql(
  `UPDATE public.reparaciones r SET estatus = 'ENTREGADO', verificado_entrega = true, fecha_verificacion_entrega = COALESCE(r.fecha_verificacion_entrega, c.fecha_liquidada, NOW()), fecha_entrega = COALESCE(r.fecha_entrega, (c.fecha_liquidada AT TIME ZONE 'America/Mexico_City')::date, CURRENT_DATE), updated_at = NOW() FROM public.cuentas c WHERE c.repara_id = r.id AND UPPER(TRIM(COALESCE(c.estatus, ''))) = 'LIQUIDADA' AND UPPER(TRIM(COALESCE(r.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA')`,
)

console.log('\n--- Pendientes después de corrección ---')
runSql(
  `SELECT COUNT(*) AS pendientes FROM public.reparaciones r INNER JOIN public.cuentas c ON c.repara_id = r.id WHERE UPPER(TRIM(COALESCE(c.estatus, ''))) = 'LIQUIDADA' AND UPPER(TRIM(COALESCE(r.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA')`,
)
