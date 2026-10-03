/**
 * Agregar producto a una cuenta con anticipo no debe pedir cobro extra (orden 1180).
 * Ejecutar: node scripts/test-pago-venta-producto.mjs
 */
import { esConceptoAnticipo, ventaProductoCubiertaPorAnticipo } from '../src/pagoVentaProducto.js'

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

test('ANTICIPO DE SERVICIO se reconoce como anticipo', () => {
  assertEqual(esConceptoAnticipo('ANTICIPO DE SERVICIO'), true, 'anticipo')
})

test('orden 1180: anticipo de servicio no pide cómo se cobró el producto', () => {
  assertEqual(
    ventaProductoCubiertaPorAnticipo({
      cargosActuales: 0,
      nuevoCargo: 350,
      pagos: [{ pago: 300, concepto: 'ANTICIPO DE SERVICIO' }],
    }),
    false,
    'cubiertaPorAnticipo',
  )
})

test('anticipo de pieza tampoco pide cobro extra', () => {
  assertEqual(
    ventaProductoCubiertaPorAnticipo({
      cargosActuales: 0,
      nuevoCargo: 700,
      pagos: [
        { pago: 300, concepto: 'ANTICIPO DE SERVICIO' },
        { pago: 450, concepto: 'ANTICIPO DE PIEZA' },
      ],
    }),
    false,
    'cubiertaPorAnticipo',
  )
})

console.log(`\n${passed} ok, ${failed} fallos`)
if (failed) process.exit(1)
