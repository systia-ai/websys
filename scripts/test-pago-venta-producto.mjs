/**
 * Cobro de producto vs anticipos (cuenta orden 1082: anticipo de pieza + servicio).
 * Ejecutar: node scripts/test-pago-venta-producto.mjs
 */
import {
  esConceptoAnticipoPieza,
  esConceptoAnticipoServicio,
  ventaProductoCubiertaPorAnticipo,
} from '../src/pagoVentaProducto.js'

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

test('ANTICIPO DE PIEZA no se trata como anticipo de servicio', () => {
  assertEqual(esConceptoAnticipoPieza('ANTICIPO DE PIEZA'), true, 'pieza')
  assertEqual(esConceptoAnticipoServicio('ANTICIPO DE PIEZA'), false, 'servicio')
})

test('ANTICIPO DE SERVICIO sí es anticipo de servicio', () => {
  assertEqual(esConceptoAnticipoPieza('ANTICIPO DE SERVICIO'), false, 'pieza')
  assertEqual(esConceptoAnticipoServicio('ANTICIPO DE SERVICIO'), true, 'servicio')
})

test('cuenta 1082: SILA6 $700 con anticipo de pieza no pide otro cobro', () => {
  const covered = ventaProductoCubiertaPorAnticipo({
    cargosActuales: 0,
    nuevoCargo: 700,
    pagos: [
      { pago: 300, concepto: 'ANTICIPO DE SERVICIO' },
      { pago: 450, concepto: 'ANTICIPO DE PIEZA' },
    ],
  })
  assertEqual(covered, false, 'cubiertaPorAnticipo')
})

test('solo anticipo de servicio que cubre el producto sí pide cobro para el corte', () => {
  const covered = ventaProductoCubiertaPorAnticipo({
    cargosActuales: 0,
    nuevoCargo: 400,
    pagos: [{ pago: 500, concepto: 'ANTICIPO DE SERVICIO' }],
  })
  assertEqual(covered, true, 'cubiertaPorAnticipo')
})

test('anticipo de servicio menor al producto no intercepta', () => {
  const covered = ventaProductoCubiertaPorAnticipo({
    cargosActuales: 0,
    nuevoCargo: 700,
    pagos: [{ pago: 300, concepto: 'ANTICIPO DE SERVICIO' }],
  })
  assertEqual(covered, false, 'cubiertaPorAnticipo')
})

test('sin anticipos no intercepta', () => {
  const covered = ventaProductoCubiertaPorAnticipo({
    cargosActuales: 0,
    nuevoCargo: 700,
    pagos: [{ pago: 800, concepto: 'ABONO' }],
  })
  assertEqual(covered, false, 'cubiertaPorAnticipo')
})

console.log(`\n${passed} ok, ${failed} fallos`)
if (failed) process.exit(1)
