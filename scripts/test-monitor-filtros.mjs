/**
 * Pruebas rápidas de la lógica de filtros del Monitor de órdenes.
 * Ejecutar: node scripts/test-monitor-filtros.mjs
 */
import {
  repCoincideBusquedaTextoMonitor,
  repCoincideFiltroMonitor,
  repEnRangoFechasMonitor,
  ordenUsaSistemaWeb,
  tipoServicioDeRep,
  tecnicoRepCoincideFiltro,
  TIPOS_SERVICIO_CANONICOS,
} from '../src/reparacionUtils.js'

const clientes = [{ id: 1, nombre: 'Juan Pérez' }]
const equipoPorId = new Map()

function estatusParaFiltro(rep) {
  const st = String(rep?.estatus ?? '').trim().toUpperCase()
  if (st === 'ENTREGADA') return 'ENTREGADO'
  return st
}

function todosTiposServicioSeleccionados(sel) {
  return TIPOS_SERVICIO_CANONICOS.length > 0 && TIPOS_SERVICIO_CANONICOS.every((t) => sel.has(t))
}

/** Réplica simplificada de filasOrdenadas en MonitorOrdenesModulo.jsx */
function filtrarMonitor(reparaciones, opts) {
  const {
    estatusSeleccionados,
    fechaDesde = '',
    fechaFin = '',
    modoFecha = null,
    tiposServicioSeleccionados = new Set(TIPOS_SERVICIO_CANONICOS),
    tecnicoFiltro = '',
    busqueda = '',
    modoFechaSinRango = false,
    rangoInvalido = false,
  } = opts

  if (rangoInvalido || modoFechaSinRango) return []

  let filtradas = reparaciones.filter(ordenUsaSistemaWeb).filter((r) =>
    repCoincideFiltroMonitor(r, {
      estatusSeleccionados,
      desde: fechaDesde,
      hasta: fechaFin,
      modoFecha,
      cuentaVinculada: null,
      ymdDesdePagos: null,
      estatusParaFiltroFn: estatusParaFiltro,
    }),
  )

  if (tiposServicioSeleccionados.size === 0) {
    filtradas = []
  } else if (!todosTiposServicioSeleccionados(tiposServicioSeleccionados)) {
    filtradas = filtradas.filter((r) => {
      const t = tipoServicioDeRep(r, equipoPorId)
      return t != null && tiposServicioSeleccionados.has(t)
    })
  }

  if (tecnicoFiltro === '__sin_tecnico__') {
    filtradas = filtradas.filter((r) => !String(r.tecnico ?? '').trim())
  } else if (tecnicoFiltro) {
    filtradas = filtradas.filter((r) => tecnicoRepCoincideFiltro(r.tecnico, tecnicoFiltro))
  }

  const qTexto = String(busqueda ?? '').trim()
  if (qTexto) {
    filtradas = filtradas.filter((r) =>
      repCoincideBusquedaTextoMonitor(r, qTexto, clientes, equipoPorId),
    )
  }

  return filtradas.map((r) => r.id)
}

function assertEqual(actual, expected, label) {
  const a = [...actual].sort((x, y) => x - y)
  const e = [...expected].sort((x, y) => x - y)
  const ok = a.length === e.length && a.every((v, i) => v === e[i])
  if (!ok) {
    console.error(`✗ ${label}`)
    console.error(`  esperado: [${e.join(', ')}]`)
    console.error(`  obtenido: [${a.join(', ')}]`)
    return false
  }
  console.log(`✓ ${label}`)
  return true
}

const reps = [
  {
    id: 101,
    estatus: 'INGRESADO',
    fecha_ingreso: '2026-06-20',
    fecha_creacion: '2026-06-20',
    problemas_reportados: 'Cambio de almohadillas',
    tipo_reparacion: 'SERVICIO',
    cliente_id: 1,
    tecnico: 'Carlos',
  },
  {
    id: 102,
    estatus: 'EN REVISION',
    fecha_ingreso: '2026-06-21',
    fecha_creacion: '2026-06-21',
    problemas_reportados: 'No imprime negro',
    tipo_reparacion: 'GARANTIA EPSON',
    cliente_id: 1,
    tecnico: '',
  },
  {
    id: 103,
    estatus: 'ENTREGADO',
    fecha_ingreso: '2026-06-18',
    fecha_entrega: '2026-06-22',
    fecha_creacion: '2026-06-18',
    problemas_reportados: 'Almohadillas y limpieza',
    tipo_reparacion: 'SERVICIO',
    cliente_id: 1,
    tecnico: 'Carlos',
  },
  {
    id: 104,
    estatus: 'REPARADO',
    fecha_ingreso: '2026-06-19',
    fecha_reparado: '2026-06-21',
    fecha_creacion: '2026-06-19',
    problemas_reportados: 'Sensor atascado',
    tipo_reparacion: 'GARANTIA SISTEBIT',
    cliente_id: 1,
    tecnico: 'Ana',
  },
]

let passed = 0
let failed = 0

function test(label, fn) {
  if (fn()) passed += 1
  else failed += 1
}

test('Estatus INGRESADO + EN REVISION', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO', 'EN REVISION']),
    }),
    [101, 102],
    'Estatus INGRESADO + EN REVISION',
  ),
)

test('Rango 20-22 jun + modo ingreso (ignora estatus)', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      fechaDesde: '2026-06-20',
      fechaFin: '2026-06-22',
      modoFecha: 'ingreso',
    }),
    [101, 102],
    'Rango 20-22 jun + modo ingreso (103 ingresó el 18, queda fuera)',
  ),
)

test('Estatus + buscador almohadillas (refina dentro del filtro)', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO', 'EN REVISION', 'ENTREGADO']),
      busqueda: 'almohadillas',
    }),
    [101, 103],
    'Estatus varios + buscador almohadillas',
  ),
)

test('Buscador no trae órdenes fuera de estatus seleccionado', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      busqueda: 'almohadillas',
    }),
    [101],
    'Solo INGRESADO + almohadillas (excluye ENTREGADO 103)',
  ),
)

test('Tipo servicio solo GARANTIA EPSON', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO', 'EN REVISION', 'ENTREGADO', 'REPARADO']),
      tiposServicioSeleccionados: new Set(['GARANTIA EPSON']),
    }),
    [102],
    'Solo tipo GARANTIA EPSON',
  ),
)

test('Técnico Carlos', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO', 'ENTREGADO', 'REPARADO']),
      tecnicoFiltro: 'Carlos',
    }),
    [101, 103],
    'Filtro técnico Carlos',
  ),
)

test('Modo fecha sin rango → lista vacía', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      modoFechaSinRango: true,
    }),
    [],
    'Modo fecha sin rango devuelve vacío',
  ),
)

test('Rango inválido → lista vacía', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      fechaDesde: '2026-06-25',
      fechaFin: '2026-06-20',
      rangoInvalido: true,
    }),
    [],
    'Rango inválido devuelve vacío',
  ),
)

test('Modo entrega en rango 22 jun', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      fechaDesde: '2026-06-22',
      fechaFin: '2026-06-22',
      modoFecha: 'entrega',
    }),
    [103],
    'Fecha entrega 22 jun (solo ENTREGADO con fecha_entrega)',
  ),
)

test('repEnRangoFechasMonitor ingreso', () => {
  const ok = repEnRangoFechasMonitor(reps[0], '2026-06-20', '2026-06-22', null, null, 'ingreso')
  if (!ok) {
    console.error('✗ repEnRangoFechasMonitor ingreso')
    return false
  }
  console.log('✓ repEnRangoFechasMonitor ingreso')
  return true
})

console.log('')
console.log(`Resultado: ${passed} ok, ${failed} fallos`)
process.exit(failed > 0 ? 1 : 0)
