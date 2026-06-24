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
  fechaReparadoYmd,
  ymdHoyLocal,
  transicionEstatusRequiereConfirmacion,
  mensajeConfirmacionTransicionEstatus,
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

test('INGRESADO → EN REVISION: ingreso = fecha_creacion (17 jun)', () => {
  const rep = {
    estatus: 'INGRESADO',
    fecha_creacion: '2026-06-17T12:00:00Z',
    updated_at: '2026-06-22T15:00:00Z',
  }
  const patch = patchFechasHitosEstatus('EN REVISION', rep, 'INGRESADO')
  assertEqual(patch.fecha_ingreso, '2026-06-17', 'fecha_ingreso = creación')
  assertEqual(patch.fecha_revision, HOY, 'fecha_revision hoy')
})

test('Corrige columna fecha_ingreso errónea (22) a creación (17)', () => {
  const rep = {
    estatus: 'EN REVISION',
    fecha_ingreso: '2026-06-22',
    fecha_creacion: '2026-06-17T12:00:00Z',
    updated_at: '2026-06-22T15:00:00Z',
  }
  const patch = patchCompletarFechasHitosFaltantes(rep)
  assertEqual(patch.fecha_ingreso, '2026-06-17', 'alinea ingreso a creación')
  assertEqual(fechaIngresoYmd(rep), '2026-06-17', 'UI muestra creación')
})

test('Cambio de estatus no pisa ingreso si ya coincide con creación', () => {
  const rep = {
    estatus: 'INGRESADO',
    fecha_ingreso: '2026-06-17',
    fecha_creacion: '2026-06-17T12:00:00Z',
    updated_at: '2026-06-22T15:00:00Z',
  }
  const patch = patchFechasHitosEstatus('EN REVISION', rep, 'INGRESADO')
  assertEqual(patch.fecha_ingreso, '2026-06-17', 'mantiene creación')
  assertEqual(patch.fecha_revision, HOY, 'solo revisión nueva')
})

test('patchCompletar alinea ingreso a creación', () => {
  const rep = {
    estatus: 'EN REVISION',
    fecha_creacion: '2026-06-17T12:00:00Z',
    fecha_ingreso: '2026-06-22',
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

test('REPARADO → EN REVISION: borra fecha_reparado', () => {
  const rep = {
    estatus: 'REPARADO',
    fecha_reparado: '2026-06-23',
    fecha_revision: '2026-06-20',
  }
  const patch = buildPatchCambioEstatusOrden('EN REVISION', rep, { estatusAnterior: 'REPARADO' })
  assertEqual(patch.fecha_reparado, null, 'fecha_reparado eliminada')
  assertEqual(patch.estatus, 'EN REVISION', 'estatus')
})

test('EN REVISION → REPARADO tras retroceso: nueva fecha_reparado hoy', () => {
  const rep = {
    estatus: 'EN REVISION',
    fecha_reparado: '2026-06-23',
    fecha_revision: '2026-06-20',
  }
  const patch = buildPatchCambioEstatusOrden('REPARADO', rep, { estatusAnterior: 'EN REVISION' })
  assertEqual(patch.fecha_reparado, HOY, 'fecha_reparado nueva')
  assertEqual(patch.estatus, 'REPARADO', 'estatus')
})

test('REPARADO → ENTREGADO: conserva fecha_reparado', () => {
  const rep = {
    estatus: 'REPARADO',
    fecha_reparado: '2026-06-23',
    verificado_entrega: true,
    fecha_verificacion_entrega: '2026-06-24T10:00:00Z',
  }
  const patch = buildPatchCambioEstatusOrden('ENTREGADO', rep, {
    estatusAnterior: 'REPARADO',
    verificadoEntrega: true,
    fechaVerificacionEntrega: '2026-06-24T10:00:00Z',
  })
  assertEqual(patch.fecha_reparado, undefined, 'no pisa fecha_reparado en patch')
  assertEqual(fechaReparadoYmd({ ...rep, ...patch }), '2026-06-23', 'fecha_reparado conservada')
  assertEqual(patch.estatus, 'ENTREGADO', 'estatus')
})

test('fechaIngresoYmd sigue mostrando creación si falta columna', () => {
  const ymd = fechaIngresoYmd({ fecha_creacion: '2026-06-17' })
  assertEqual(ymd, '2026-06-17', 'display ingreso')
})

test('transicionEstatusRequiereConfirmacion: revisión ↔ reparado', () => {
  assertEqual(
    transicionEstatusRequiereConfirmacion('EN REVISION', 'REPARADO'),
    true,
    'revision a reparado',
  )
  assertEqual(
    transicionEstatusRequiereConfirmacion('REPARADO', 'EN REVISION'),
    true,
    'reparado a revision',
  )
  assertEqual(
    transicionEstatusRequiereConfirmacion('INGRESADO', 'EN REVISION'),
    false,
    'otros sin confirmación',
  )
})

test('mensajeConfirmacionTransicionEstatus', () => {
  assertEqual(
    mensajeConfirmacionTransicionEstatus('EN REVISION', 'REPARADO'),
    '¿Está seguro que desea cambiar el estatus a Reparado?',
    'mensaje a reparado',
  )
  assertEqual(
    mensajeConfirmacionTransicionEstatus('REPARADO', 'EN REVISION').includes('En revisión'),
    true,
    'mensaje a revision',
  )
})

console.log(`\nResultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
