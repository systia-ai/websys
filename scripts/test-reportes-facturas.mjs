/**
 * Filtros del reporte de facturas.
 * Ejecutar: node scripts/test-reportes-facturas.mjs
 */
import {
  filtrarCuentasParaReporteFacturas,
  validarCriterioReporteFacturas,
  resumenTotalesReporteFacturas,
  ordenarCuentasFacturaPorFolio,
} from '../src/reportesFacturas.js'

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
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}: esperado ${e}, obtenido ${a}`)
}

const clientes = [
  { id: 1, nombre: 'JUAN PEREZ' },
  { id: 2, nombre: 'MARIA LOPEZ' },
]

const cuentas = [
  {
    id: 10,
    cliente_id: 1,
    lleva_factura: true,
    folio_factura: 'A-100',
    total_factura: 500,
    created_at: '2026-09-10T12:00:00',
    estatus: 'PENDIENTE',
  },
  {
    id: 11,
    cliente_id: 2,
    lleva_factura: true,
    folio_factura: 'B-200',
    total_factura: 250,
    created_at: '2026-09-20T12:00:00',
    estatus: 'LIQUIDADA',
  },
  {
    id: 12,
    cliente_id: 1,
    lleva_factura: false,
    folio_factura: null,
    total: 80,
    created_at: '2026-09-15T12:00:00',
  },
]

test('rango de fechas solo incluye cuentas con factura en el periodo', () => {
  const r = filtrarCuentasParaReporteFacturas(cuentas, clientes, {
    modo: 'rango',
    ini: '2026-09-01',
    fin: '2026-09-15',
  })
  assertEqual(r.map((c) => c.id), [10], 'ids en rango')
})

test('folio fiscal coincide sin importar mayúsculas', () => {
  const r = filtrarCuentasParaReporteFacturas(cuentas, clientes, { modo: 'folio', folio: 'b-200' })
  assertEqual(r.map((c) => c.id), [11], 'ids por folio')
})

test('lista queda ordenada por folio', () => {
  const r = ordenarCuentasFacturaPorFolio([
    cuentas[1],
    { ...cuentas[0], folio_factura: 'Z-9' },
    { ...cuentas[0], id: 13, folio_factura: 'A-2' },
  ])
  assertEqual(r.map((c) => c.folio_factura), ['A-2', 'B-200', 'Z-9'], 'folios ordenados')
})

test('excluye cuentas sin marca de factura', () => {
  const r = filtrarCuentasParaReporteFacturas(cuentas, clientes, {
    modo: 'rango',
    ini: '2026-09-01',
    fin: '2026-09-30',
  })
  assertEqual(r.map((c) => c.id).sort(), [10, 11], 'solo facturas')
})

test('validación folio vacío', () => {
  const msg = validarCriterioReporteFacturas({ modo: 'folio', folio: '  ' })
  if (!msg) throw new Error('debía pedir folio')
})

test('resumen suma importes de factura', () => {
  const r = resumenTotalesReporteFacturas(cuentas.filter((c) => c.lleva_factura))
  assertEqual(r, { cantidad: 2, importe: 750 }, 'totales')
})

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
