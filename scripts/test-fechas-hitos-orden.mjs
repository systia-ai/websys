/**
 * Pruebas de fechas de hitos al cambiar estatus (no sobrescribir ingreso).
 * Ejecutar: node scripts/test-fechas-hitos-orden.mjs
 */
import {
  patchFechasHitosEstatus,
  patchCompletarFechasHitosFaltantes,
  buildPatchCambioEstatusOrden,
  ymdIngresoPreservar,
  fechaIngresoYmd,
  ymdHoyLocal,
} from '../src/reparacionUtils.js'

const HOY = ymdHoyLocal()

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
  if (actual !== expected) throw new Error(`${msg}: esperado "${expected}", obtenido "${actual}"`)
}

test('ymdIngresoPreservar usa fecha_creacion si falta fecha_ingreso', () => {
  assertEqual(
    ymdIngresoPreservar({ fecha_creacion: '2026-06-17T18:00:00Z' }),
    '2026-06-17',
    'ingreso desde creación',
  )
})

test('INGRESADO → EN REVISION conserva ingreso 17 jun y marca revisión hoy', () => {
  const rep = {
    estatus: 'INGRESADO',
    fecha_creacion: '2026-06-17T12:00:00Z',
    updated_at: '2026-06-22T15:00:00Z',
  }
  const patch = patchFechasHitosEstatus('EN REVISION', rep, 'INGRESADO')
  assertEqual(patch.fecha_ingreso, '2026-06-17', 'fecha_ingreso')
  assertEqual(patch.fecha_revision, HOY, 'fecha_revision hoy')
})

test('No sobrescribe fecha_ingreso existente al cambiar estatus', () => {
  const rep = {
    estatus: 'INGRESADO',
    fecha_ingreso: '2026-06-17',
    fecha_creacion: '2026-06-20T12:00:00Z',
    updated_at: '2026-06-22T15:00:00Z',
  }
  const patch = patchFechasHitosEstatus('EN REVISION', rep, 'INGRESADO')
  assertEqual(patch.fecha_ingreso, undefined, 'no tocar ingreso')
  assertEqual(patch.fecha_revision, HOY, 'solo revisión nueva')
})

test('patchCompletar no usa updated_at para ingreso', () => {
  const rep = {
    estatus: 'EN REVISION',
    fecha_creacion: '2026-06-17T12:00:00Z',
    updated_at: '2026-06-22T15:00:00Z',
  }
  const patch = patchCompletarFechasHitosFaltantes(rep)
  assertEqual(patch.fecha_ingreso, '2026-06-17', 'ingreso desde creación')
})

test('buildPatchCambioEstatusOrden INGRESADO → EN REVISION', () => {
  const rep = {
    estatus: 'INGRESADO',
    fecha_creacion: '2026-06-17',
  }
  const patch = buildPatchCambioEstatusOrden('EN REVISION', rep, { estatusAnterior: 'INGRESADO' })
  assertEqual(patch.fecha_ingreso, '2026-06-17', 'ingreso preservado')
  assertEqual(patch.fecha_revision, HOY, 'revisión hoy')
  assertEqual(patch.estatus, 'EN REVISION', 'estatus')
})

test('fechaIngresoYmd sigue mostrando creación si falta columna', () => {
  const ymd = fechaIngresoYmd({ fecha_creacion: '2026-06-17' })
  assertEqual(ymd, '2026-06-17', 'display ingreso')
})

console.log(`\nResultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
