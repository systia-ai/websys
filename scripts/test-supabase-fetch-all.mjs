/**
 * Pruebas de paginación PostgREST (tope 1000 filas).
 * Ejecutar: node scripts/test-supabase-fetch-all.mjs
 */
import { fetchAllRows } from '../src/supabaseFetchAll.js'

let passed = 0
let failed = 0

function test(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✓ ${label}`)
      passed += 1
    })
    .catch((e) => {
      console.error(`✗ ${label}`)
      console.error(`  ${e.message}`)
      failed += 1
    })
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: esperado "${expected}", obtenido "${actual}"`)
}

function mockPagedQuery(pages) {
  let n = 0
  return () => ({
    range() {
      const page = n
      n += 1
      return Promise.resolve({ data: pages[page] ?? [], error: null })
    },
  })
}

await test('una sola página menor al tope', async () => {
  const rows = await fetchAllRows(
    mockPagedQuery([
      [{ id: 1 }, { id: 2 }],
    ]),
    1000,
  )
  assertEqual(rows.length, 2, 'filas')
  assertEqual(rows[1].id, 2, 'última')
})

await test('dos páginas: 1000 + 16 como el monitor de órdenes', async () => {
  const p1 = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }))
  const p2 = Array.from({ length: 16 }, (_, i) => ({ id: 1001 + i }))
  const rows = await fetchAllRows(mockPagedQuery([p1, p2]), 1000)
  assertEqual(rows.length, 1016, 'total')
  assertEqual(rows[0].id, 1, 'primera')
  assertEqual(rows[999].id, 1000, 'fin página 1')
  assertEqual(rows[1000].id, 1001, 'inicio página 2')
  assertEqual(rows[1015].id, 1016, 'última (p. ej. órdenes > 1000)')
})

await test('propaga error de Supabase', async () => {
  let threw = false
  try {
    await fetchAllRows(() => ({
      range() {
        return Promise.resolve({ data: null, error: { message: 'boom' } })
      },
    }))
  } catch (e) {
    threw = e.message === 'boom'
  }
  assertEqual(threw, true, 'lanza el error')
})

console.log(`\nResultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
