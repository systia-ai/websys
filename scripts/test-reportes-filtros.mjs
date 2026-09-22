/**
 * Filtros combinables de reportes (entrada, salida, estatus).
 * Ejecutar: node scripts/test-reportes-filtros.mjs
 */
import {
  AGRUPACIONES_ESTADISTICAS,
  datasetsComparativaReporte,
  kpisDesdeDatasets,
  kpisSeleccionReporte,
  serieOrdenesPorFechaExtractor,
  tituloComparativa,
  totalesDesdeDatasets,
} from '../src/reportesEstadisticas.js'
import { filtrarReparacionesParaReporte, etiquetaFiltrosReporteAplicados } from '../src/reportesFiltros.js'

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

const reps = [
  {
    id: 1,
    estatus: 'INGRESADO',
    fecha_ingreso: '2026-09-05',
    fecha_creacion: '2026-09-05',
    created_at: '2026-09-05T10:00:00',
  },
  {
    id: 2,
    estatus: 'ENTREGADO',
    fecha_ingreso: '2026-08-20',
    fecha_entrega: '2026-09-10',
    fecha_creacion: '2026-08-20',
    created_at: '2026-08-20T10:00:00',
  },
  {
    id: 3,
    estatus: 'REPARADO',
    fecha_ingreso: '2026-09-08',
    fecha_reparado: '2026-09-12',
    fecha_creacion: '2026-09-08',
    created_at: '2026-09-08T10:00:00',
  },
  {
    id: 4,
    estatus: 'ENTREGADO',
    fecha_ingreso: '2026-09-02',
    fecha_entrega: '2026-09-15',
    fecha_creacion: '2026-09-02',
    created_at: '2026-09-02T10:00:00',
  },
]

const rango = { ini: '2026-09-01', fin: '2026-09-22' }
const todosEstatus = new Set([
  'INGRESADO',
  'ENTREGADO',
  'ENTREGADO SIN REPARACION',
  'REPARADO',
  'EN ESPERA POR REFACCION',
  'SIN REPARACION',
  'BAJA',
  'EN REVISION',
])

function ids(opts) {
  return filtrarReparacionesParaReporte(reps, {
    estatusSet: todosEstatus,
    ...rango,
    ...opts,
  }).map((r) => r.id)
}

test('default entrada+salida: une ingresos y entregas del mes', () => {
  assertEqual(ids({ incluirIngreso: true, incluirEntrega: true }), [1, 2, 3, 4], 'union')
})

test('solo equipos que entraron: no incluye quien solo salió (ingreso en agosto)', () => {
  assertEqual(ids({ incluirIngreso: true, incluirEntrega: false }), [1, 3, 4], 'ingreso')
})

test('solo equipos que salieron: entrega en el mes', () => {
  assertEqual(ids({ incluirIngreso: false, incluirEntrega: true }), [2, 4], 'salida')
})

test('combinar entrada + estatus REPARADO: une ambas', () => {
  const got = filtrarReparacionesParaReporte(reps, {
    estatusSet: new Set(['REPARADO']),
    ...rango,
    incluirIngreso: true,
    incluirEntrega: false,
    incluirEstatus: true,
  }).map((r) => r.id)
  assertEqual(got, [1, 3, 4], 'union con estatus')
})

test('solo filtrar por estatus INGRESADO', () => {
  const got = filtrarReparacionesParaReporte(reps, {
    estatusSet: new Set(['INGRESADO']),
    ...rango,
    incluirEstatus: true,
  }).map((r) => r.id)
  assertEqual(got, [1], 'solo ingresado')
})

test('sin modos: lista vacía', () => {
  assertEqual(ids({}), [], 'vacio')
})

test('etiqueta de filtros default', () => {
  assertEqual(
    etiquetaFiltrosReporteAplicados({ incluirIngreso: true, incluirEntrega: true }),
    'Equipos que entraron · Equipos que salieron',
    'label',
  )
})

test('comparativos solo día, mes y año (sin semana)', () => {
  assertEqual(
    AGRUPACIONES_ESTADISTICAS.map((a) => a.id),
    ['dia', 'mes', 'anio'],
    'ids',
  )
})

test('serie de entradas usa fecha_ingreso', () => {
  const serie = serieOrdenesPorFechaExtractor(
    reps,
    { ini: '2026-09-01', fin: '2026-09-22' },
    'dia',
    (r) => r.fecha_ingreso,
  )
  const dia5 = serie.find((d) => d.label === '2026-09-05')
  const diaAgo = serie.find((d) => d.label === '2026-08-20')
  assertEqual(dia5?.value, 1, '5 sep')
  assertEqual(diaAgo, undefined, 'agosto fuera de buckets')
})

test('comparativa combina entrada y salida en las mismas series', () => {
  const ds = datasetsComparativaReporte({
    reparaciones: reps,
    periodo: rango,
    agrupacion: 'dia',
    incluirIngreso: true,
    incluirEntrega: true,
  })
  assertEqual(ds.map((d) => d.id), ['ingreso', 'entrega'], 'ids')
  assertEqual(ds.map((d) => d.label), ['Entraron', 'Salieron'], 'labels')
  assertEqual(ds[0].points.length, ds[1].points.length, 'mismo eje X')
  const vEnt = (ymd) => ds[0].points.find((p) => p.label === ymd)?.value
  const vSal = (ymd) => ds[1].points.find((p) => p.label === ymd)?.value
  assertEqual(vEnt('2026-09-05'), 1, 'entró el 5')
  assertEqual(vSal('2026-09-05'), 0, 'nadie salió el 5')
  assertEqual(vEnt('2026-09-10'), 0, 'nadie entró el 10')
  assertEqual(vSal('2026-09-10'), 1, 'salió el 10')
  const tot = totalesDesdeDatasets(ds)
  assertEqual(
    tot.map((t) => [t.label, t.value]),
    [
      ['Entraron', 3],
      ['Salieron', 2],
    ],
    'totales circular',
  )
})

test('solo estatus: una serie por estatus para comparar', () => {
  const ds = datasetsComparativaReporte({
    reparaciones: reps,
    periodo: rango,
    agrupacion: 'dia',
    incluirEstatus: true,
  })
  const ids = ds.map((d) => d.id).sort()
  if (!ids.includes('estatus-ENTREGADO')) throw new Error(`falta ENTREGADO: ${ids}`)
  if (ds.length < 2) throw new Error(`se esperaban varias series de estatus, hay ${ds.length}`)
})

test('entrada + estatus: cada estatus marcado es una serie, no la suma', () => {
  const ds = datasetsComparativaReporte({
    reparaciones: reps,
    periodo: rango,
    agrupacion: 'dia',
    incluirIngreso: true,
    incluirEstatus: true,
    estatusSet: ['REPARADO', 'INGRESADO'],
  })
  assertEqual(ds.map((d) => d.id), ['ingreso', 'estatus-INGRESADO', 'estatus-REPARADO'], 'ids combinados')
  if (ds.some((d) => d.id === 'estatus')) throw new Error('no debe haber serie sumada Por estatus')
  const kpis = kpisDesdeDatasets(ds)
  assertEqual(
    kpis.map((k) => k.id),
    ['ingreso', 'estatus-INGRESADO', 'estatus-REPARADO'],
    'kpis',
  )
  const nIngresado = kpis.find((k) => k.id === 'estatus-INGRESADO')?.value
  const nReparado = kpis.find((k) => k.id === 'estatus-REPARADO')?.value
  assertEqual(nIngresado, 1, 'un ingresado')
  assertEqual(nReparado, 1, 'un reparado')
})

test('kpis: equipos que entraron y que salieron', () => {
  const ds = datasetsComparativaReporte({
    reparaciones: reps,
    periodo: rango,
    agrupacion: 'dia',
    incluirIngreso: true,
    incluirEntrega: true,
  })
  const kpis = kpisDesdeDatasets(ds)
  assertEqual(
    kpis.map((k) => [k.label, k.value]),
    [
      ['Equipos que entraron', 3],
      ['Equipos que salieron', 2],
    ],
    'kpis movimiento',
  )
})

test('reporte usa las mismas tarjetas de selección que las gráficas', () => {
  const kpis = kpisSeleccionReporte({
    reparaciones: reps,
    periodo: { ...rango, incluirIngreso: true, incluirEntrega: true, incluirEstatus: true, estatusSet: ['REPARADO'] },
  })
  assertEqual(
    kpis.map((k) => k.id),
    ['ingreso', 'entrega', 'estatus-REPARADO'],
    'ids reporte',
  )
})

test('títulos de comparativa día/mes/año', () => {
  assertEqual(tituloComparativa('dia'), 'Comparativa por día', 'dia')
  assertEqual(tituloComparativa('mes'), 'Comparativa por mes', 'mes')
  assertEqual(tituloComparativa('anio'), 'Comparativa por año', 'anio')
})

console.log(`\nResultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
