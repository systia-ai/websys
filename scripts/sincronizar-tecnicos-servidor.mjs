/**
 * Publica el catálogo de técnicos en app_config para todas las PCs.
 * Uso: npx dotenv -e .env -- node scripts/sincronizar-tecnicos-servidor.mjs
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_TECNICOS } from '../src/tecnicosCatalogo.js'

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

const lista = JSON.stringify(DEFAULT_TECNICOS)
console.log('--- Catálogo a publicar ---')
console.log(DEFAULT_TECNICOS.join(', '))

console.log('\n--- app_config.tecnicos (antes) ---')
runSql("SELECT config->'tecnicos' AS tecnicos FROM public.app_config WHERE id = 1")

console.log('\n--- Actualizando ---')
runSql(
  `UPDATE public.app_config SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('tecnicos', '${lista}'::jsonb), updated_at = NOW() WHERE id = 1`,
)

console.log('\n--- app_config.tecnicos (después) ---')
runSql("SELECT config->'tecnicos' AS tecnicos FROM public.app_config WHERE id = 1")
