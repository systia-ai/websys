/**
 * Pruebas rápidas de la lógica de filtros del Monitor de órdenes.
 * Ejecutar: node scripts/test-monitor-filtros.mjs
 */
import {
  repCoincideBusquedaProblemaSolucionMonitor,
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
    filtradas = filtradas.filter((r) => repCoincideBusquedaProblemaSolucionMonitor(r, qTexto, clientes))
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
    descripcion_solucion: 'Limpieza de almohadillas',
    tipo_reparacion: 'GARANTIA SISTEBIT',
    cliente_id: 1,
    tecnico: 'Ana',
  },
  {
    id: 499,
    estatus: 'ENTREGADO',
    fecha_ingreso: '2026-06-21',
    fecha_entrega: '2026-06-22',
    fecha_creacion: '2026-06-21',
    problemas_reportados: 'Mantenimiento',
    tipo_reparacion: 'SERVICIO',
    cliente_id: 1,
    tecnico: 'Carlos',
  },
  {
    id: 105,
    estatus: 'REPARADO',
    fecha_ingreso: '2026-06-20',
    fecha_reparado: '2026-06-22',
    fecha_creacion: '2026-06-20',
    problemas_reportados: 'Doble técnico',
    tipo_reparacion: 'SERVICIO',
    cliente_id: 1,
    tecnico: 'JUAN & VERO',
  },
  {
    id: 106,
    estatus: 'INGRESADO',
    fecha_ingreso: '2026-06-22',
    fecha_creacion: '2026-06-22',
    problemas_reportados: 'Sin asignar aún',
    tipo_reparacion: 'SERVICIO',
    cliente_id: 1,
    tecnico: null,
  },
]

const TODOS_ESTATUS = new Set(['INGRESADO', 'EN REVISION', 'ENTREGADO', 'REPARADO'])

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
    [101, 102, 106],
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
    [101, 102, 105, 106, 499],
    'Rango 20-22 jun + modo ingreso (499 ingresó el 21)',
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

test('Técnico Carlos (todos los estatus)', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: TODOS_ESTATUS,
      tecnicoFiltro: 'Carlos',
    }),
    [101, 103, 499],
    'Filtro técnico Carlos en todas las órdenes Carlos',
  ),
)

test('Técnico Carlos + estatus INGRESADO', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      tecnicoFiltro: 'CARLOS',
    }),
    [101],
    'Carlos solo con INGRESADO (excluye ENTREGADO 103/499)',
  ),
)

test('Técnico Carlos + estatus ENTREGADO', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['ENTREGADO']),
      tecnicoFiltro: 'carlos',
    }),
    [103, 499],
    'Carlos con ENTREGADO (case-insensitive)',
  ),
)

test('Técnico Ana + estatus REPARADO', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['REPARADO']),
      tecnicoFiltro: 'Ana',
    }),
    [104],
    'Ana solo en REPARADO',
  ),
)

test('Técnico Ana + estatus INGRESADO → vacío', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      tecnicoFiltro: 'Ana',
    }),
    [],
    'Ana no tiene órdenes INGRESADO',
  ),
)

test('Sin técnico asignado', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: TODOS_ESTATUS,
      tecnicoFiltro: '__sin_tecnico__',
    }),
    [102, 106],
    'Órdenes sin técnico (vacío o null)',
  ),
)

test('Sin técnico + estatus EN REVISION', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['EN REVISION']),
      tecnicoFiltro: '__sin_tecnico__',
    }),
    [102],
    'Sin técnico respeta estatus',
  ),
)

test('Doble técnico JUAN & VERO — filtro JUAN', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: TODOS_ESTATUS,
      tecnicoFiltro: 'JUAN',
    }),
    [105],
    'Orden con JUAN & VERO coincide con filtro JUAN',
  ),
)

test('Doble técnico JUAN & VERO — filtro VERO', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: TODOS_ESTATUS,
      tecnicoFiltro: 'VERO',
    }),
    [105],
    'Orden con JUAN & VERO coincide con filtro VERO',
  ),
)

test('Técnico Carlos + tipo SERVICIO', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: TODOS_ESTATUS,
      tecnicoFiltro: 'Carlos',
      tiposServicioSeleccionados: new Set(['SERVICIO']),
    }),
    [101, 103, 499],
    'Carlos excluye Ana (GARANTIA SISTEBIT)',
  ),
)

test('Técnico Carlos + buscador almohadillas', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: TODOS_ESTATUS,
      tecnicoFiltro: 'Carlos',
      busqueda: 'almohadillas',
    }),
    [101, 103],
    'Carlos + texto refina sobre técnico',
  ),
)

test('Técnico Carlos + modo ingreso en rango 21 jun', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      tecnicoFiltro: 'Carlos',
      fechaDesde: '2026-06-21',
      fechaFin: '2026-06-21',
      modoFecha: 'ingreso',
    }),
    [499],
    'Carlos + fecha ingreso 21 jun (ignora estatus chip)',
  ),
)

test('tecnicoRepCoincideFiltro unidad', () => {
  const casos = [
    ['Carlos', 'Carlos', true],
    ['JUAN & VERO', 'JUAN', true],
    ['JUAN & VERO', 'VERO', true],
    ['JUAN & VERO', 'CARLOS', false],
    ['', 'CARLOS', false],
    ['Ana López', 'ANA', true],
  ]
  for (const [rep, filtro, esperado] of casos) {
    const ok = tecnicoRepCoincideFiltro(rep, filtro) === esperado
    if (!ok) {
      console.error(`✗ tecnicoRepCoincideFiltro("${rep}", "${filtro}")`)
      return false
    }
  }
  console.log('✓ tecnicoRepCoincideFiltro casos unitarios')
  return true
})

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

test('Buscador en descripcion_solucion (no en problema)', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['REPARADO']),
      busqueda: 'limpieza',
    }),
    [104],
    'Busca en descripcion_solucion',
  ),
)

test('Buscador por nombre de cliente dentro de filtros', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO', 'EN REVISION', 'ENTREGADO', 'REPARADO']),
      busqueda: 'juan',
    }),
    [101, 102, 103, 104, 105, 106, 499],
    'Nombre juan coincide con Juan Pérez en todas las órdenes del fixture',
  ),
)

test('Buscador por cliente respeta estatus seleccionado', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      busqueda: 'juan',
    }),
    [101, 106],
    'Juan pero solo INGRESADO',
  ),
)

test('Buscador #499 exacto dentro de filtros', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['ENTREGADO']),
      busqueda: '499',
    }),
    [499],
    'Orden 499 con estatus ENTREGADO',
  ),
)

test('Buscador 499 no muestra orden fuera de estatus filtrado', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['INGRESADO']),
      busqueda: '499',
    }),
    [],
    'Orden 499 no aparece si solo INGRESADO está seleccionado',
  ),
)

test('Buscador #499 con numeral', () =>
  assertEqual(
    filtrarMonitor(reps, {
      estatusSeleccionados: new Set(['ENTREGADO']),
      busqueda: '#499',
    }),
    [499],
    'Formato #499',
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
    [103, 499],
    'Fecha entrega 22 jun (ENTREGADO con fecha_entrega)',
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
