/**
 * Pruebas: total/saldo de cuenta al eliminar cargos de la lista.
 * Ejecutar: node scripts/test-cuenta-totales-lineas.mjs
 */
import {
  totalVentaSyncDesdeLineas,
  totalesVisiblesCuenta,
} from '../src/reparacionUtils.js'

let passed = 0
let failed = 0

function test(label, fn) {
  try {
    fn()
    console.log(`✓ ${label}`)
    passed += 1
  } catch (e) {
    console.error(`✗ ${label}`)
    console.error(`  ${e.message}`)
    failed += 1
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: esperado ${expected}, obtenido ${actual}`)
}

test('eliminar cargo de $500: total baja a 0 aunque BD tenga 500', () => {
  const lineas = [{ tipo: 'pago', subtotal: -200 }]
  assertEqual(totalVentaSyncDesdeLineas(lineas, 500), 0, 'total sync')
})

test('anticipo $200 sin cargos: saldo pendiente 0, anticipo a favor', () => {
  const lineas = [{ tipo: 'pago', subtotal: -200 }]
  const vis = totalesVisiblesCuenta(0, [{ pago: 200 }])
  assertEqual(vis.saldoPendiente, 0, 'adeudo')
  assertEqual(vis.saldoAFavor, true, 'a favor')
  assertEqual(vis.totalDisplay, -200, 'total negativo')
})

test('cargo $500 y pago $200: adeudo $300', () => {
  const lineas = [
    { tipo: 'reparamov', subtotal: 500 },
    { tipo: 'pago', subtotal: -200 },
  ]
  assertEqual(totalVentaSyncDesdeLineas(lineas, 0), 500, 'total')
  const vis = totalesVisiblesCuenta(500, [{ pago: 200 }])
  assertEqual(vis.saldoPendiente, 300, 'adeudo')
})

test('sin líneas en UI: usa total de BD', () => {
  assertEqual(totalVentaSyncDesdeLineas([], 500), 500, 'fallback BD')
})

console.log(`\nResultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
