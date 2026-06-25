/**
 * Orden 574 — anticipo registrado como EFECTIVO; corregir a TARJETA.
 * Uso: npx dotenv -e .env -- node scripts/corregir-pago-orden-574-tarjeta.mjs
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
  execSync(
    `npx supabase db query "${oneLine.replace(/"/g, '\\"')}" --db-url "${dbUrl.replace(/"/g, '\\"')}" -o table --agent no`,
    { stdio: 'inherit', cwd: root, shell: true, env: process.env },
  )
}

console.log('--- Antes ---')
runSql(
  "SELECT p.id, p.cuenta_id, p.pago, p.concepto, p.forma_pago, c.repara_id AS orden FROM public.pagosclientes p JOIN public.cuentas c ON c.id = p.cuenta_id WHERE c.repara_id = 574",
)

console.log('\n--- Corrigiendo ---')
runSql(
  "UPDATE public.pagosclientes p SET forma_pago = 'TARJETA' FROM public.cuentas c WHERE c.id = p.cuenta_id AND c.repara_id = 574 AND UPPER(TRIM(COALESCE(p.forma_pago, ''))) = 'EFECTIVO'",
)
runSql("UPDATE public.cuentas SET tipo_pago = 'TARJETA' WHERE repara_id = 574")

console.log('\n--- Después ---')
runSql(
  "SELECT p.id, p.cuenta_id, p.pago, p.concepto, p.forma_pago, c.tipo_pago, c.repara_id AS orden FROM public.pagosclientes p JOIN public.cuentas c ON c.id = p.cuenta_id WHERE c.repara_id = 574",
)

console.log('\nListo.')
