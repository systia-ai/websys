/**
 * Corrige JARETNY → JARENY en app_config.tecnicos y reparaciones.tecnico.
 * Uso: npx dotenv -e .env -- node scripts/corregir-tecnico-jareny.mjs
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

console.log('--- Técnicos en órdenes (JARETNY / JARENY) ---')
runSql(
  "SELECT id, tecnico FROM public.reparaciones WHERE UPPER(COALESCE(tecnico, '')) LIKE '%JARET%' ORDER BY id",
)

console.log('\n--- app_config.tecnicos (antes) ---')
runSql("SELECT config->'tecnicos' AS tecnicos FROM public.app_config WHERE id = 1")

console.log('\n--- Corrigiendo catálogo en app_config ---')
runSql(`
  UPDATE public.app_config
  SET
    config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{tecnicos}',
      COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(
            CASE
              WHEN UPPER(TRIM(BOTH '"' FROM elem::text)) = 'JARETNY' THEN 'JARENY'
              ELSE UPPER(TRIM(BOTH '"' FROM elem::text))
            END
          ))
          FROM jsonb_array_elements(COALESCE(config->'tecnicos', '[]'::jsonb)) AS elem
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = NOW()
  WHERE id = 1
`)

console.log('\n--- Corrigiendo reparaciones.tecnico ---')
runSql(`
  UPDATE public.reparaciones
  SET
    tecnico = TRIM(BOTH ' ' FROM
      REGEXP_REPLACE(
        REGEXP_REPLACE(UPPER(COALESCE(tecnico, '')), 'JARETNY', 'JARENY', 'g'),
        '\\s+', ' ', 'g'
      )
    ),
    updated_at = NOW()
  WHERE UPPER(COALESCE(tecnico, '')) LIKE '%JARETNY%'
`)

console.log('\n--- app_config.tecnicos (después) ---')
runSql("SELECT config->'tecnicos' AS tecnicos FROM public.app_config WHERE id = 1")

console.log('\n--- Órdenes corregidas ---')
runSql(
  "SELECT id, tecnico FROM public.reparaciones WHERE UPPER(COALESCE(tecnico, '')) LIKE '%JARENY%' ORDER BY id",
)

console.log('\nListo.')
