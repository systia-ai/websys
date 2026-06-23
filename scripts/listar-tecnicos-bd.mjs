import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbUrl = process.env.SUPABASE_DB_URL?.trim()
if (!dbUrl) process.exit(1)

function runSql(sql) {
  const oneLine = sql.replace(/\s+/g, ' ').trim()
  execSync(
    `npx supabase db query "${oneLine.replace(/"/g, '\\"')}" --db-url "${dbUrl.replace(/"/g, '\\"')}" -o table --agent no`,
    { stdio: 'inherit', cwd: root, shell: true, env: process.env },
  )
}

runSql(
  "SELECT DISTINCT tecnico FROM public.reparaciones WHERE tecnico IS NOT NULL AND TRIM(tecnico) <> '' ORDER BY tecnico",
)
