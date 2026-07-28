require('dotenv').config()

async function runSql(ref, token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  return JSON.parse(text)
}

async function main() {
  const projectUrl = process.env.VITE_SUPABASE_URL
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = new URL(projectUrl).hostname.split('.')[0]

  // Grants / column privileges for authenticated
  const grants = await runSql(
    ref,
    token,
    `
    SELECT grantee, privilege_type, column_name
    FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='productos'
      AND column_name IN ('precio_compra','precio_venta','descripcion','existencia')
    ORDER BY column_name, grantee, privilege_type;
    `,
  )
  console.log('GRANTS', JSON.stringify(grants, null, 2))

  // Check if there is a view wrapping productos
  const views = await runSql(
    ref,
    token,
    `
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema='public' AND (table_name ILIKE '%producto%' OR view_definition ILIKE '%productos%')
    LIMIT 20;
    `,
  )
  console.log('VIEWS', JSON.stringify(views, null, 2).slice(0, 2000))
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
