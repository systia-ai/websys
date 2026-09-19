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
  fechaIngresoFiltroYmd,
  fechaReparadoYmd,
  ymdHoyLocal,
  transicionEstatusRequiereConfirmacion,
  mensajeConfirmacionTransicionEstatus,
  estatusSiguientesPermitidos,
  validarTransicionEstatus,
  patchReparacionEntregada,
  estatusCanonicoFiltro,
  fechaBajaYmd,
  fechaHitoEstatusMonitor,
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

test('SIN REPARACION → ENTREGADO: registra ENTREGADO SIN REPARACION', () => {
  const rep = {
    estatus: 'SIN REPARACION',
    fecha_sin_reparacion: '2026-06-20',
    verificado_entrega: true,
    fecha_verificacion_entrega: '2026-06-21T10:00:00Z',
    fecha_creacion: '2026-06-17',
  }
  const patch = buildPatchCambioEstatusOrden('ENTREGADO', rep, {
    estatusAnterior: 'SIN REPARACION',
    verificadoEntrega: true,
    fechaVerificacionEntrega: '2026-06-21T10:00:00Z',
  })
  assertEqual(patch.estatus, 'ENTREGADO SIN REPARACION', 'estatus registrado')
  assertEqual(patch.fecha_reparado, undefined, 'no inventa fecha_reparado')
  assertEqual(Boolean(patch.fecha_entrega), true, 'sí registra fecha_entrega')
})

test('patchReparacionEntregada desde SIN REPARACION', () => {
  const patch = patchReparacionEntregada(
    { estatus: 'SIN REPARACION', fecha_sin_reparacion: '2026-06-20' },
    { verificadoEntrega: true },
  )
  assertEqual(patch.estatus, 'ENTREGADO SIN REPARACION', 'estatus al liquidar/entregar')
})

test('estatusSiguientesPermitidos desde SIN REPARACION incluye ENTREGADO SIN REPARACION', () => {
  const ops = estatusSiguientesPermitidos('SIN REPARACION')
  assertEqual(ops.includes('ENTREGADO SIN REPARACION'), true, 'opción de entrega')
  assertEqual(ops.includes('ENTREGADO'), false, 'no ofrece ENTREGADO genérico')
})

test('validarTransicionEstatus permite ENTREGADO y ENTREGADO SIN REPARACION desde SIN REPARACION', () => {
  assertEqual(validarTransicionEstatus('SIN REPARACION', 'ENTREGADO').ok, true, 'ENTREGADO')
  assertEqual(
    validarTransicionEstatus('SIN REPARACION', 'ENTREGADO SIN REPARACION').ok,
    true,
    'ENTREGADO SIN REPARACION',
  )
})

test('estatusSiguientesPermitidos incluye BAJA desde estatus de taller, no desde ENTREGADO', () => {
  assertEqual(estatusSiguientesPermitidos('INGRESADO').includes('BAJA'), true, 'desde INGRESADO')
  assertEqual(estatusSiguientesPermitidos('REPARADO').includes('BAJA'), true, 'desde REPARADO')
  assertEqual(estatusSiguientesPermitidos('SIN REPARACION').includes('BAJA'), true, 'desde SIN REPARACION')
  assertEqual(estatusSiguientesPermitidos('ENTREGADO').includes('BAJA'), false, 'no desde ENTREGADO')
  const desdeBaja = estatusSiguientesPermitidos('BAJA')
  assertEqual(desdeBaja.includes('EN REVISION'), true, 'desde BAJA a EN REVISION')
  assertEqual(desdeBaja.length, 1, 'solo EN REVISION desde BAJA')
})

test('validarTransicionEstatus permite BAJA y reactivar a EN REVISION', () => {
  assertEqual(validarTransicionEstatus('INGRESADO', 'BAJA').ok, true, 'INGRESADO → BAJA')
  assertEqual(validarTransicionEstatus('REPARADO', 'BAJA').ok, true, 'REPARADO → BAJA')
  assertEqual(validarTransicionEstatus('BAJA', 'EN REVISION').ok, true, 'BAJA → EN REVISION')
  assertEqual(validarTransicionEstatus('ENTREGADO', 'BAJA').ok, false, 'no ENTREGADO → BAJA')
  assertEqual(validarTransicionEstatus('BAJA', 'ENTREGADO').ok, false, 'no BAJA → ENTREGADO')
})

test('transicion a BAJA requiere confirmación', () => {
  assertEqual(transicionEstatusRequiereConfirmacion('INGRESADO', 'BAJA'), true, 'confirmar BAJA')
  assertEqual(transicionEstatusRequiereConfirmacion('BAJA', 'EN REVISION'), true, 'confirmar reactivar')
})

test('INGRESADO → BAJA registra fecha_baja de hoy', () => {
  const rep = {
    estatus: 'INGRESADO',
    fecha_creacion: '2026-06-17T12:00:00Z',
    fecha_ingreso: '2026-06-17',
  }
  const patch = buildPatchCambioEstatusOrden('BAJA', rep, { estatusAnterior: 'INGRESADO' })
  assertEqual(patch.estatus, 'BAJA', 'estatus')
  assertEqual(patch.fecha_baja, HOY, 'fecha_baja hoy')
  assertEqual(fechaHitoEstatusMonitor({ ...rep, ...patch }), HOY, 'hito monitor es fecha_baja')
})

test('BAJA → EN REVISION borra fecha_baja', () => {
  const rep = {
    estatus: 'BAJA',
    fecha_creacion: '2026-06-17T12:00:00Z',
    fecha_ingreso: '2026-06-17',
    fecha_baja: '2026-09-10',
  }
  const patch = buildPatchCambioEstatusOrden('EN REVISION', rep, { estatusAnterior: 'BAJA' })
  assertEqual(patch.estatus, 'EN REVISION', 'estatus')
  assertEqual(patch.fecha_baja, null, 'limpia fecha_baja')
  assertEqual(fechaBajaYmd({ ...rep, ...patch }), null, 'sin fecha_baja en merged')
})

test('fechaHitoEstatusMonitor de BAJA usa fecha_baja, no ingreso', () => {
  assertEqual(
    fechaHitoEstatusMonitor({
      estatus: 'BAJA',
      fecha_ingreso: '2026-06-01',
      fecha_baja: '2026-09-18',
    }),
    '2026-09-18',
    'hito baja',
  )
})

test('estatusCanonicoFiltro agrupa ENTREGADO SIN REPARACION con ENTREGADO', () => {
  assertEqual(estatusCanonicoFiltro('ENTREGADO SIN REPARACION'), 'ENTREGADO', 'filtro')
  assertEqual(estatusCanonicoFiltro('ENTREGADA'), 'ENTREGADO', 'ENTREGADA')
})

test('fechaIngresoFiltroYmd usa columna fecha_ingreso, no fecha_creacion', () => {
  assertEqual(
    fechaIngresoFiltroYmd({
      fecha_ingreso: '2026-09-14',
      fecha_creacion: '2026-09-15T05:00:00Z',
    }),
    '2026-09-14',
    'columna fecha_ingreso',
  )
  assertEqual(
    fechaIngresoFiltroYmd({
      fecha_ingreso: '2026-09-14T00:00:00.000Z',
      fecha_creacion: '2026-09-15T05:00:00Z',
    }),
    '2026-09-14',
    'date serializada con medianoche UTC no se recorre un día',
  )
  assertEqual(
    fechaIngresoFiltroYmd({ fecha_creacion: '2026-09-15T05:00:00Z' }),
    null,
    'sin columna no inventa ingreso',
  )
})

console.log(`\nResultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
