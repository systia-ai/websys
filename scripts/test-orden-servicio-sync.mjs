/**
 * Lookup de equipo al actualizar orden: no debe fallar por el tope de 1000 filas.
 * Ejecutar: node scripts/test-orden-servicio-sync.mjs
 */
import { sincronizarEquipoParaOrden } from '../src/ordenServicioSync.js'

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

function mockSupabase({ equipos, unfilteredCap = 1000 }) {
  const byId = new Map(equipos.map((e) => [Number(e.id), e]))
  return {
    from() {
      const state = { eqCol: null, eqVal: null, ordered: false }
      const q = {
        select() {
          return q
        },
        eq(col, val) {
          state.eqCol = col
          state.eqVal = val
          return q
        },
        order() {
          state.ordered = true
          return q
        },
        range(from, to) {
          const slice = equipos.slice(from, to + 1)
          return Promise.resolve({ data: slice, error: null })
        },
        maybeSingle() {
          if (state.eqCol === 'id') {
            return Promise.resolve({ data: byId.get(Number(state.eqVal)) ?? null, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
        then(resolve, reject) {
          try {
            if (state.eqCol === 'serie') {
              const hits = equipos.filter((e) => e.serie === state.eqVal)
              resolve({ data: hits, error: null })
              return
            }
            if (state.eqCol === 'id') {
              const row = byId.get(Number(state.eqVal))
              resolve({ data: row ? [row] : [], error: null })
              return
            }
            resolve({ data: equipos.slice(0, unfilteredCap), error: null })
          } catch (e) {
            reject(e)
          }
        },
      }
      return q
    },
  }
}

const equipos = []
for (let i = 1; i <= 1000; i += 1) {
  equipos.push({ id: i, serie: `SERIE${String(i).padStart(4, '0')}`, tipo_equipo: 'IMPRESORA' })
}
equipos.push({ id: 1088, serie: 'X8GO052955', tipo_equipo: 'IMPRESORA' })

await test('sin equipoId: encuentra serie más allá del tope de 1000', async () => {
  const supabase = mockSupabase({ equipos })
  const { id, error } = await sincronizarEquipoParaOrden(supabase, {
    equipoId: null,
    serie: 'X8GO052955',
    tipo_equipo: 'IMPRESORA',
  })
  assertEqual(error, null, 'error')
  assertEqual(id, 1088, 'id')
})

await test('con equipoId de la orden: resuelve aunque la serie no esté en las primeras 1000', async () => {
  const supabase = mockSupabase({ equipos })
  const { id, error } = await sincronizarEquipoParaOrden(supabase, {
    equipoId: 1088,
    serie: 'X8GO052955',
    tipo_equipo: 'IMPRESORA',
  })
  assertEqual(error, null, 'error')
  assertEqual(id, 1088, 'id')
})

await test('sin coincidencia: mensaje con la serie buscada', async () => {
  const supabase = mockSupabase({ equipos })
  const { id, error } = await sincronizarEquipoParaOrden(supabase, {
    equipoId: null,
    serie: 'NOEXISTE',
    tipo_equipo: 'IMPRESORA',
  })
  assertEqual(id, null, 'id')
  if (!String(error ?? '').includes('NOEXISTE')) {
    throw new Error(`mensaje inesperado: ${error}`)
  }
})

await test('serie repetida: la orden usa el equipo de la sesión y no pide cambiar la serie', async () => {
  const supabase = mockSupabase({
    equipos: [
      { id: 5, serie: 'X8G5080053', tipo_equipo: 'IMPRESORA', cliente_id: 9 },
      { id: 8, serie: 'X8G5080053', tipo_equipo: 'IMPRESORA', cliente_id: 9 },
    ],
  })
  const { id, error } = await sincronizarEquipoParaOrden(supabase, {
    equipoId: 8,
    serie: 'X8G5080053',
    tipo_equipo: 'IMPRESORA',
    clienteId: 9,
  })
  assertEqual(error, null, 'error')
  assertEqual(id, 8, 'id')
})

await test('serie de otro equipo: usa el ya registrado del mismo cliente', async () => {
  const supabase = mockSupabase({
    equipos: [
      { id: 1, serie: 'TEMPORAL', tipo_equipo: 'IMPRESORA', cliente_id: 9 },
      { id: 2, serie: 'X8G5080053', tipo_equipo: 'IMPRESORA', cliente_id: 4 },
      { id: 3, serie: 'X8G5080053', tipo_equipo: 'IMPRESORA', cliente_id: 9 },
    ],
  })
  const { id, error } = await sincronizarEquipoParaOrden(supabase, {
    equipoId: 1,
    serie: 'X8G5080053',
    tipo_equipo: 'IMPRESORA',
    clienteId: 9,
  })
  assertEqual(error, null, 'error')
  assertEqual(id, 3, 'id')
})

console.log(`\n${passed} ok, ${failed} fallos`)
if (failed) process.exit(1)
