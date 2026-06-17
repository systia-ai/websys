/**
 * Aplica migraciones al proyecto remoto de Supabase.
 * Ejecutar: npm run db:push  (carga .env vía dotenv-cli)
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const dbUrl = process.env.SUPABASE_DB_URL?.trim()
const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim()

let cmd
if (dbUrl) {
  cmd = `npx supabase db push --db-url "${dbUrl}" --yes`
} else if (dbPassword) {
  const escaped = dbPassword.replace(/"/g, '\\"')
  cmd = `npx supabase db push --linked --password "${escaped}" --yes`
} else {
  console.error('Falta SUPABASE_DB_URL o SUPABASE_DB_PASSWORD en .env')
  process.exit(1)
}

console.log('Aplicando migraciones en Supabase remoto…')
execSync(cmd, { stdio: 'inherit', cwd: root, shell: true })
