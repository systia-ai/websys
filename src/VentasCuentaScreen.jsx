import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { deleteSupabaseVerificado } from './supabaseDeleteUtils.js'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { reponerExistencia, registrarVentaEnCuenta } from './inventarioStock.js'
import { emojiParaProducto, readIconosMap } from './productoEmoji.js'
import { esProductoContable, etiquetaExistencia } from './productoUtils.js'
import {
  leerRecientesProductosVentas,
  mergeRecientesProductos,
  ordenarProductosMasRecientes,
  recientesProductosDesdeCuentamov,
  registrarProductoRecienteVentas,
} from './productosRecientesVentas.js'
import { insertPagoCliente, sumMontoPagos } from './pagosClientesUtils.js'
import {
  actualizarCuentaSupabase,
  aYmdLocalDesdeRaw,
  entregarOrdenVinculadaSiCuentaLiquidada,
  patchOrdenEntregadaSiAplica,
  formatFechaLegibleEsMx,
  aplicarCuentaPagadaActiva,
  formatMontoCuenta,
  sincronizarEstatusCuentaPorSaldo,
  totalesVisiblesCuenta,
  sumPagosCuenta,
  cuentaTieneSoloAnticipo,
  descripcionEquipoParaRecibo,
  esGarantiaSinCobroTipo,
  etiquetaGarantiaSinCobro,
  formatFechaBitacora,
  normalizarReparacionId,
  registrarNotificacionClienteEnBitacora,
  cuentaSinOrdenVinculada,
  vincularCuentaAOrdenSupabase,
  ymdHoyLocal,
} from './reparacionUtils.js'
import { buildMensajeNotificacionCuentaCliente } from './cuentaNotificacionMensaje.js'
import { buildWhatsAppUrl } from './whatsappUtils.js'
import { printReciboCuentaPdf, RECIBO_PRINT_HINT } from './reciboCuentaPdf.js'
import ModalAlerta from './ModalAlerta.jsx'

const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'
const LS_REP = 'sistefix_local_reparaciones'
const LS_REPARAMOV = 'sistefix_local_reparamov'
const LS_PAGOS = 'sistefix_local_pagosclientes'
const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_CAT = 'sistefix_local_catalogopagos'
const LS_VISTA_SELECTOR_PRODUCTOS = 'sistefix_ventas_selector_productos_vista'

function leerVistaSelectorProductos() {
  try {
    return localStorage.getItem(LS_VISTA_SELECTOR_PRODUCTOS) === 'tabla' ? 'tabla' : 'tarjetas'
  } catch {
    return 'tarjetas'
  }
}

let __seq = 1
function nextLocalId() {
  __seq += 1
  return __seq
}

function readLs(key, fb) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fb))
  } catch {
    return fb
  }
}

function writeLs(key, v) {
  localStorage.setItem(key, JSON.stringify(v))
}

function sumSubtotales(lineas) {
  return lineas.reduce((s, L) => s + Number(L.subtotal ?? 0), 0)
}

function totalCargosDesdeLineas(lineas) {
  return lineas
    .filter((l) => l.tipo !== 'pago')
    .reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
}

function pagosDesdeLineas(lineas) {
  return lineas
    .filter((l) => l.tipo === 'pago')
    .map((l) => ({ pago: Math.abs(Number(l.subtotal ?? l.precioUnitario ?? 0)) }))
}

function sumPagosDesdeLineas(lineas) {
  return pagosDesdeLineas(lineas).reduce((s, p) => s + Number(p.pago ?? 0), 0)
}

/** Balance neto (cargos − pagos); negativo = anticipo / saldo a favor. */
function calcularBalanceNeto(lineas, cuentaTotal) {
  const tieneLineas = lineas.some((l) => l.tipo === 'pago') || lineas.some((l) => l.tipo !== 'pago')
  if (tieneLineas) {
    return totalCargosDesdeLineas(lineas) - sumPagosDesdeLineas(lineas)
  }
  return Number(cuentaTotal ?? 0)
}

/** Adeudo pendiente (mínimo 0) para cobrar o liquidar. */
function calcularSaldoPendiente(lineas, cuentaTotal) {
  return Math.max(0, calcularBalanceNeto(lineas, cuentaTotal))
}

function totalVentaParaSync(cuentaTotal, lineas) {
  const cargos = totalCargosDesdeLineas(lineas)
  const ct = Number(cuentaTotal ?? 0)
  return Math.max(ct, cargos)
}

/** Si el costo de reparación en la orden no está en reparamov, lo muestra como cargo virtual. */
function inyectarCostoReparacionSiFalta(lineas, rep) {
  if (!rep) return lineas
  const costo = Number(rep.costo_reparacion ?? 0)
  if (costo <= 0.0001) return lineas
  const sumRepMov = lineas
    .filter((l) => l.tipo === 'reparamov')
    .reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
  if (sumRepMov >= costo - 0.01) return lineas
  const faltante = Math.max(0, costo - sumRepMov)
  return [
    ...lineas,
    {
      key: `rep_costo_${rep.id}`,
      tipo: 'reparacion_cargo',
      dbId: null,
      virtual: true,
      producto_id: 0,
      cantidad: 1,
      descripcion: `[REPARACIÓN] ${String(rep.descripcion_equipo ?? 'Costo de reparación').trim() || 'Costo de reparación'}`,
      precioUnitario: faltante,
      subtotal: faltante,
    },
  ]
}

/** Cuenta con total en BD pero sin movimientos cargados (p. ej. datos solo en Android). */
function inyectarSaldoCuentaSiSinMovimientos(lineas, cuentaRow) {
  if (!cuentaRow?.id) return lineas
  const sum = sumSubtotales(lineas)
  const ct = Number(cuentaRow.total ?? 0)
  const tieneCargosGuardados = lineas.some(
    (l) => l.tipo !== 'pago' && !l.virtual && (l.tipo === 'cuentamov' || l.tipo === 'reparamov'),
  )
  if (tieneCargosGuardados || Math.abs(sum) > 0.0001 || ct <= 0.0001) return lineas
  return [
    ...lineas,
    {
      key: `cuenta_saldo_${cuentaRow.id}`,
      tipo: 'cuenta_cargo',
      dbId: null,
      virtual: true,
      producto_id: 0,
      cantidad: 1,
      descripcion: '[CUENTA] Saldo pendiente',
      precioUnitario: ct,
      subtotal: ct,
    },
  ]
}

function lookupProducto(productosPorId, productoId) {
  if (productoId == null || productoId === '') return null
  return productosPorId.get(String(productoId)) ?? null
}

function rawFechaPago(p) {
  if (!p) return null
  return p.created_at ?? p.fecha ?? p.fecha_pago ?? p.Fecha ?? null
}

function etiquetaFechaPago(p) {
  const ymd = aYmdLocalDesdeRaw(rawFechaPago(p))
  if (!ymd) return '—'
  return formatFechaLegibleEsMx(ymd, { day: '2-digit', month: 'short', year: 'numeric' })
}

function crearLineaPago(p) {
  const monto = Number(p.pago ?? 0)
  const concepto = p.concepto ?? 'Pago'
  return {
    key: `pago_${p.id}`,
    tipo: 'pago',
    dbId: p.id,
    producto_id: -1,
    cantidad: -1,
    concepto,
    descripcion: `PAGO: ${concepto} (${p.forma_pago ?? 'EFECTIVO'})`,
    precioUnitario: monto,
    subtotal: -monto,
    fechaPago: etiquetaFechaPago(p),
    fechaPagoYmd: aYmdLocalDesdeRaw(rawFechaPago(p)),
  }
}

function sumImportePagosLineas(lineasPagos) {
  return (lineasPagos ?? [])
    .filter((l) => l.tipo === 'pago')
    .reduce((s, l) => s + Math.abs(Number(l.precioUnitario ?? l.subtotal ?? 0)), 0)
}

function lineasReciboPorModo(lineas, modo, fechaYmd) {
  if (modo === 'pagos_fecha') {
    return (lineas ?? []).filter((l) => l.tipo === 'pago' && l.fechaPagoYmd === fechaYmd)
  }
  return lineas ?? []
}

function fechasPagosDesdeLineas(lineas) {
  const map = new Map()
  for (const l of lineas ?? []) {
    if (l.tipo !== 'pago') continue
    const ymd = l.fechaPagoYmd
    if (!ymd) continue
    const prev = map.get(ymd) ?? { ymd, count: 0, importe: 0 }
    prev.count += 1
    prev.importe += Math.abs(Number(l.precioUnitario ?? l.subtotal ?? 0))
    map.set(ymd, prev)
  }
  return [...map.values()]
    .sort((a, b) => b.ymd.localeCompare(a.ymd))
    .map((item) => ({
      ...item,
      label: formatFechaLegibleEsMx(item.ymd, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    }))
}

function buildLineasDesdeServidor({ movs, reps, pagos, productosPorId = new Map() }) {
  const lineas = []
  for (const m of movs) {
    const cant = Number(m.cantidad ?? 0)
    const costo = Number(m.costo ?? 0)
    const prod = lookupProducto(productosPorId, m.producto_id)
    lineas.push({
      key: `cuentamov_${m.id}`,
      tipo: 'cuentamov',
      dbId: m.id,
      producto_id: m.producto_id ?? 0,
      contable: prod ? esProductoContable(prod) : true,
      cantidad: cant,
      descripcion: `[VENTA] ${m.descripcion ?? 'Sin descripción'}`,
      precioUnitario: costo,
      subtotal: cant * costo,
    })
  }
  for (const r of reps) {
    const cant = Number(r.cantidad ?? 0)
    const costo = Number(r.costo ?? 0)
    lineas.push({
      key: `reparamov_${r.id}`,
      tipo: 'reparamov',
      dbId: r.id,
      producto_id: r.producto_id ?? 0,
      cantidad: cant,
      descripcion: `[REPARACIÓN] ${r.descripcion ?? 'Sin descripción'}`,
      precioUnitario: costo,
      subtotal: cant * costo,
    })
  }
  const pagosOrdenados = [...pagos].sort((a, b) => {
    const ya = aYmdLocalDesdeRaw(rawFechaPago(a)) ?? ''
    const yb = aYmdLocalDesdeRaw(rawFechaPago(b)) ?? ''
    if (ya !== yb) return ya.localeCompare(yb)
    return Number(a.id ?? 0) - Number(b.id ?? 0)
  })
  for (const p of pagosOrdenados) {
    lineas.push(crearLineaPago(p))
  }
  return lineas
}

/**
 * Pantalla Cuentas / Ventas alineada con VentasScreen.kt (lista, total, estatus, pagos, productos, liquidar, comprobante, salir).
 */
export default function VentasCuentaScreen({
  supabase,
  context,
  onSalir,
  onError,
  onNotice,
  puedeEliminar = false,
  puedeLiquidarCuentas = true,
}) {
  const { alertaPermiso, intentarEliminar, mostrarSinPermiso } = usePermisoEliminar(puedeEliminar)
  const cliente = useMemo(() => normalizeClienteRow(context?.cliente ?? {}), [context?.cliente])
  const cuentaInicial = context?.cuenta

  const [loading, setLoading] = useState(true)
  const [cuentaInfo, setCuentaInfo] = useState(null)
  const [reparaIdCuenta, setReparaIdCuenta] = useState(null)
  /** Orden y equipo ligados a la cuenta (para comprobante PDF). */
  const [reciboOrdenEquipo, setReciboOrdenEquipo] = useState(null)
  const [tipoReparacionOrden, setTipoReparacionOrden] = useState(null)
  const [lineas, setLineas] = useState([])
  const [mostrarCamposProducto, setMostrarCamposProducto] = useState(false)
  const [modalPago, setModalPago] = useState(false)
  const [modalProductos, setModalProductos] = useState(false)
  const [vistaSelectorProductos, setVistaSelectorProductos] = useState(leerVistaSelectorProductos)
  const [catalogo, setCatalogo] = useState([])
  const [busqCat, setBusqCat] = useState('')
  const [selCat, setSelCat] = useState(null)
  const [cantPago, setCantPago] = useState('1')
  const [valorPago, setValorPago] = useState('')
  const [formaPago, setFormaPago] = useState('EFECTIVO')
  const [todosProductos, setTodosProductos] = useState([])
  const [busqProd, setBusqProd] = useState('')
  /** Orden del selector: productos usados más recientemente primero. */
  const [recientesProductosIds, setRecientesProductosIds] = useState(() => leerRecientesProductosVentas())
  const [serieProd, setSerieProd] = useState('')
  const [descProd, setDescProd] = useState('')
  const [existencia, setExistencia] = useState('')
  const [cantProd, setCantProd] = useState('')
  const [precioProd, setPrecioProd] = useState('')
  const [productoIdSel, setProductoIdSel] = useState(0)
  const [productoContableSel, setProductoContableSel] = useState(true)
  const [modalFormaPagoTotal, setModalFormaPagoTotal] = useState(false)
  const [modalEstatusPagoCero, setModalEstatusPagoCero] = useState(false)
  const [modalNotificarCliente, setModalNotificarCliente] = useState(false)
  const [mensajeNotificacionEditado, setMensajeNotificacionEditado] = useState('')
  const [confirmandoEnvioNotificacion, setConfirmandoEnvioNotificacion] = useState(false)
  const [errorNotificacion, setErrorNotificacion] = useState('')
  const [modalExitoNotificacion, setModalExitoNotificacion] = useState(false)
  const [detalleExitoNotificacion, setDetalleExitoNotificacion] = useState('')
  const [pagandoAdeudoTotal, setPagandoAdeudoTotal] = useState(false)
  const pagandoAdeudoRef = useRef(false)
  const [ordenVinculoInput, setOrdenVinculoInput] = useState(() =>
    context?.reparacionOrdenId != null ? String(context.reparacionOrdenId) : '',
  )
  const [vinculandoOrden, setVinculandoOrden] = useState(false)
  const [imprimiendoRecibo, setImprimiendoRecibo] = useState(false)
  const [modalImprimirRecibo, setModalImprimirRecibo] = useState(false)
  const [modoRecibo, setModoRecibo] = useState('cuenta')
  const [fechaReciboPagos, setFechaReciboPagos] = useState(() => ymdHoyLocal())
  /** Tras elegir «Liquidar» o «Activa pagada» en el modal: no volver a PENDIENTE por sync automático. */
  const estatusElegidoManualRef = useRef(null)

  const cuentaId = cuentaInfo?.id ?? cuentaInicial?.id ?? null
  const esCuentaExistente = cuentaId != null && Number(cuentaId) > 0
  const cuentaEstatus = String(cuentaInfo?.estatus ?? cuentaInicial?.estatus ?? '')
  const totalCargos = useMemo(() => {
    const cargos = totalCargosDesdeLineas(lineas)
    if (cargos > 0.0001) return cargos
    const ct = Number(cuentaInfo?.total ?? cuentaInicial?.total ?? 0)
    return ct > 0.0001 ? ct : cargos
  }, [lineas, cuentaInfo?.total, cuentaInicial?.total])
  const balanceNeto = useMemo(
    () => calcularBalanceNeto(lineas, totalCargos),
    [lineas, totalCargos],
  )
  const visiblesCuenta = useMemo(
    () => totalesVisiblesCuenta(totalCargos, pagosDesdeLineas(lineas)),
    [totalCargos, lineas],
  )
  const saldoPendiente = visiblesCuenta.saldoPendiente
  const saldoAFavor = visiblesCuenta.saldoAFavor
  const totalStr = formatMontoCuenta(visiblesCuenta.totalDisplay)
  const saldoStr = formatMontoCuenta(visiblesCuenta.saldoDisplay)
  const fechasPagosCuenta = useMemo(() => fechasPagosDesdeLineas(lineas), [lineas])
  const pagosEnFechaRecibo = useMemo(() => {
    const filtradas = lineasReciboPorModo(lineas, 'pagos_fecha', fechaReciboPagos)
    return {
      count: filtradas.length,
      importe: sumImportePagosLineas(filtradas),
    }
  }, [lineas, fechaReciboPagos])

  useEffect(() => {
    if (fechasPagosCuenta.length === 0) return
    if (!fechaReciboPagos || !fechasPagosCuenta.some((f) => f.ymd === fechaReciboPagos)) {
      setFechaReciboPagos(fechasPagosCuenta[0].ymd)
    }
  }, [fechasPagosCuenta, fechaReciboPagos])
  const esGarantiaSinCobro = esGarantiaSinCobroTipo(tipoReparacionOrden)
  const puedePagarAdeudoTotal = esCuentaExistente && saldoPendiente > 0.0001
  const puedeLiquidarCuenta =
    puedeLiquidarCuentas &&
    esCuentaExistente &&
    cuentaEstatus.toUpperCase() !== 'LIQUIDADA' &&
    (esGarantiaSinCobro ||
      (totalCargos > 0.0001 && !cuentaTieneSoloAnticipo(totalCargos, pagosDesdeLineas(lineas))))
  const ordenVinculadaId = useMemo(() => {
    const raw =
      reparaIdCuenta ??
      cuentaInfo?.repara_id ??
      cuentaInicial?.repara_id ??
      context?.reparacionOrdenId ??
      context?.monitorReparacionId ??
      reciboOrdenEquipo?.orden ??
      null
    return normalizarReparacionId(raw)
  }, [
    reparaIdCuenta,
    cuentaInfo?.repara_id,
    cuentaInicial?.repara_id,
    context?.reparacionOrdenId,
    context?.monitorReparacionId,
    reciboOrdenEquipo?.orden,
  ])
  const cuentaRequiereVinculoOrden =
    esCuentaExistente && cuentaSinOrdenVinculada(cuentaInfo ?? cuentaInicial)
  const subtotalProdV = useMemo(() => {
    const c = Number(cantProd)
    const p = Number(precioProd)
    if (Number.isFinite(c) && Number.isFinite(p) && c > 0 && p > 0) return (c * p).toFixed(2)
    return ''
  }, [cantProd, precioProd])

  const productoCatalogoSel = useMemo(() => {
    if (!productoIdSel) return null
    return todosProductos.find((p) => sameId(p.id, productoIdSel)) ?? null
  }, [todosProductos, productoIdSel])

  const productosFiltrados = useMemo(() => {
    const t = busqProd.trim().toLowerCase()
    let lista = todosProductos
    if (t) {
      lista = lista.filter(
        (p) =>
          String(p.serie ?? '')
            .toLowerCase()
            .includes(t) || String(p.descripcion ?? '').toLowerCase().includes(t),
      )
    }
    return ordenarProductosMasRecientes(lista, recientesProductosIds)
  }, [todosProductos, busqProd, recientesProductosIds])

  const catFiltrado = useMemo(() => {
    const t = busqCat.trim().toLowerCase()
    if (!t) return catalogo
    return catalogo.filter((c) => String(c.concepto ?? '').toLowerCase().includes(t))
  }, [catalogo, busqCat])

  const recargarCuentaInfoDesdeServidor = useCallback(
    async (cid) => {
      if (cid == null) return null
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').select('*').eq('id', cid).maybeSingle()
        if (error) throw error
        return data
      }
      return readLs(LS_CUENTAS, []).find((c) => sameId(c.id, cid)) ?? null
    },
    [supabase],
  )

  const cargarTodo = useCallback(
    async (cid, reparaBoot) => {
      setLoading(true)
      try {
        let cuentaRow = null
        if (cid != null) {
          if (supabase) {
            const { data, error } = await supabase.from('cuentas').select('*').eq('id', cid).maybeSingle()
            if (error) throw error
            cuentaRow = data
          } else {
            cuentaRow = readLs(LS_CUENTAS, []).find((c) => sameId(c.id, cid)) ?? null
          }
        }
        setCuentaInfo(cuentaRow)
        const ridRaw = cuentaRow?.repara_id ?? reparaBoot ?? null
        const rid = normalizarReparacionId(ridRaw)
        setReparaIdCuenta(rid)

        let movs = []
        if (cid != null) {
          if (supabase) {
            const r1 = await supabase.from('cuentamov').select('*').eq('cuenta_id', cid)
            if (!r1.error) movs = r1.data ?? []
          } else {
            movs = readLs(LS_CUENTAMOV, []).filter((m) => sameId(m.cuenta_id, cid))
          }
        }

        let reps = []
        let repOrden = null
        let equipoOrden = null
        if (rid != null) {
          if (supabase) {
            const [r2, rRep] = await Promise.all([
              supabase.from('reparamov').select('*').eq('repara_id', rid),
              supabase
                .from('reparaciones')
                .select('id, costo_reparacion, descripcion_equipo, equipo_id, tipo_reparacion')
                .eq('id', rid)
                .maybeSingle(),
            ])
            if (!r2.error) reps = r2.data ?? []
            if (!rRep.error) repOrden = rRep.data
            const eid = repOrden?.equipo_id
            if (eid != null && eid !== '') {
              const rEq = await supabase
                .from('equipos')
                .select('tipo_equipo, descripcion, serie')
                .eq('id', eid)
                .maybeSingle()
              if (!rEq.error) equipoOrden = rEq.data
            }
          } else {
            reps = readLs(LS_REPARAMOV, []).filter((x) => sameId(x.repara_id, rid))
            repOrden = readLs(LS_REP, []).find((x) => sameId(x.id, rid)) ?? null
            if (repOrden?.equipo_id != null) {
              equipoOrden = readLs(LS_EQUIPOS, []).find((e) => sameId(e.id, repOrden.equipo_id)) ?? null
            }
          }
        }

        const descEq = descripcionEquipoParaRecibo(repOrden, equipoOrden)
        setReciboOrdenEquipo(
          rid != null
            ? {
                orden: String(rid),
                descripcionEquipo: descEq || null,
                tipoReparacion: repOrden?.tipo_reparacion ?? null,
              }
            : null,
        )
        setTipoReparacionOrden(repOrden?.tipo_reparacion ?? null)

        let pagos = []
        if (cid != null) {
          if (supabase) {
            const r3 = await supabase.from('pagosclientes').select('*').eq('cuenta_id', cid)
            if (!r3.error) pagos = r3.data ?? []
          } else {
            pagos = readLs(LS_PAGOS, []).filter((p) => sameId(p.cuenta_id, cid))
          }
        }

        let productosLista = []
        if (supabase) {
          const r4 = await supabase.from('productos').select('id, contable')
          if (!r4.error) productosLista = r4.data ?? []
        } else {
          productosLista = readLs(LS_PRODUCTOS, [])
        }
        const productosPorId = new Map(productosLista.map((p) => [String(p.id), p]))

        let built = buildLineasDesdeServidor({ movs, reps, pagos, productosPorId })
        built = inyectarCostoReparacionSiFalta(built, repOrden)
        built = inyectarSaldoCuentaSiSinMovimientos(built, cuentaRow)
        setLineas(built)

        if (cuentaRow?.id) {
          const totalSync = totalVentaParaSync(cuentaRow.total, built)
          const estInicial = String(cuentaRow.estatus ?? '').trim().toUpperCase()
          let actualizada = cuentaRow
          if (estInicial === 'LIQUIDADA' || estInicial === 'PAGADA') {
            estatusElegidoManualRef.current = estInicial
            actualizada = { ...cuentaRow, total: totalSync, saldo: estInicial === 'LIQUIDADA' ? 0 : cuentaRow.saldo }
            if (estInicial === 'LIQUIDADA') {
              const ridSync = normalizarReparacionId(rb ?? cuentaRow.repara_id)
              if (supabase) {
                void entregarOrdenVinculadaSiCuentaLiquidada(supabase, cuentaRow.id, ridSync).catch(
                  () => {},
                )
              } else if (ridSync != null) {
                const lr = readLs(LS_REP, [])
                const repRow = lr.find((r) => sameId(r.id, ridSync)) ?? {}
                const patchEnt = patchOrdenEntregadaSiAplica(repRow)
                if (patchEnt) {
                  writeLs(
                    LS_REP,
                    lr.map((r) => (sameId(r.id, ridSync) ? { ...r, ...patchEnt } : r)),
                  )
                }
              }
            }
          } else if (supabase) {
            actualizada = await sincronizarEstatusCuentaPorSaldo(supabase, cuentaRow, pagos, {
              totalVenta: totalSync,
            })
          } else {
            const pagosLs = pagos
            const pagado = pagosLs.reduce((s, p) => s + Number(p.pago ?? 0), 0)
            const adeudo = Math.max(0, totalSync - pagado)
            const est = String(cuentaRow.estatus ?? '').trim().toUpperCase()
            if (adeudo > 0.01 || (totalSync <= 0.0001 && pagado > 0.0001 && est === 'LIQUIDADA')) {
              actualizada = { ...cuentaRow, estatus: 'PENDIENTE', total: totalSync, fecha_liquidada: null }
            } else if (totalSync > 0.0001 && pagado >= totalSync - 0.01) {
              if (est === 'LIQUIDADA') {
                const nowLiq = new Date().toISOString()
                actualizada = {
                  ...cuentaRow,
                  total: totalSync,
                  saldo: 0,
                  estatus: 'LIQUIDADA',
                  fecha_liquidada: cuentaRow.fecha_liquidada ?? nowLiq,
                }
              } else if (est === 'PAGADA') {
                actualizada = { ...cuentaRow, total: totalSync, saldo: 0, estatus: 'PAGADA', fecha_liquidada: null }
              } else {
                actualizada = { ...cuentaRow, total: totalSync, saldo: 0, estatus: 'PENDIENTE', fecha_liquidada: null }
              }
            }
            const list = readLs(LS_CUENTAS, [])
            writeLs(
              LS_CUENTAS,
              list.map((c) => (sameId(c.id, cuentaRow.id) ? actualizada : c)),
            )
          }
          setCuentaInfo(actualizada)
        }
      } catch (e) {
        onError?.(`Error al cargar cuenta: ${e.message}`)
        setLineas([])
      } finally {
        setLoading(false)
      }
    },
    [supabase, onError],
  )

  /* Sincronizar líneas con cuenta (Supabase/local); mismo rol que LaunchedEffect en Android. */
  /* eslint-disable react-hooks/set-state-in-effect -- carga asíncrona + reset al cambiar cuenta */
  useEffect(() => {
    const cid = cuentaInicial?.id
    const rb =
      cuentaInicial?.repara_id ?? context?.reparacionOrdenId ?? context?.monitorReparacionId ?? null
    if (cid != null) {
      void cargarTodo(cid, rb)
    } else {
      setCuentaInfo(null)
      setReparaIdCuenta(normalizarReparacionId(rb))
      setLineas([])
      setLoading(false)
    }
  }, [
    cuentaInicial?.id,
    cuentaInicial?.repara_id,
    context?.reparacionOrdenId,
    context?.monitorReparacionId,
    cargarTodo,
  ])
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistirTotalCuenta = useCallback(async () => {
    if (cuentaId == null || Number(cuentaId) <= 0) return
    try {
      const totalSync = totalVentaParaSync(totalCargos, lineas)
      let pagosSync = pagosDesdeLineas(lineas)
      if (supabase) {
        const { data: pagosDb, error: ePag } = await supabase
          .from('pagosclientes')
          .select('*')
          .eq('cuenta_id', cuentaId)
        if (!ePag && (pagosDb ?? []).length > 0) pagosSync = pagosDb
      }
      const estFijado =
        estatusElegidoManualRef.current || String(cuentaInfo?.estatus ?? cuentaInicial?.estatus ?? '').trim().toUpperCase()
      if (estFijado === 'LIQUIDADA' || estFijado === 'PAGADA') {
        const pagado = sumMontoPagos(pagosSync)
        const patch = {
          total: totalSync,
          saldo: 0,
          estatus: estFijado,
          fecha_liquidada: estFijado === 'LIQUIDADA' ? cuentaInfo?.fecha_liquidada ?? new Date().toISOString() : null,
        }
        if (supabase) {
          await actualizarCuentaSupabase(supabase, cuentaId, patch)
          const refreshed = await recargarCuentaInfoDesdeServidor(cuentaId)
          if (refreshed) setCuentaInfo(refreshed)
          else setCuentaInfo((prev) => ({ ...(prev ?? { id: cuentaId }), ...patch }))
        } else {
          const list = readLs(LS_CUENTAS, [])
          const prev = list.find((c) => sameId(c.id, cuentaId)) ?? { id: cuentaId }
          const next = { ...prev, ...patch }
          writeLs(LS_CUENTAS, list.map((c) => (sameId(c.id, cuentaId) ? next : c)))
          setCuentaInfo(next)
          if (estFijado === 'LIQUIDADA' && ordenVinculadaId != null) {
            const lr = readLs(LS_REP, [])
            const repRow = lr.find((r) => sameId(r.id, ordenVinculadaId)) ?? {}
            const patchEnt = patchOrdenEntregadaSiAplica(repRow)
            if (patchEnt) {
              writeLs(
                LS_REP,
                lr.map((r) => (sameId(r.id, ordenVinculadaId) ? { ...r, ...patchEnt } : r)),
              )
            }
          }
        }
        return
      }
      if (supabase) {
        const base = cuentaInfo ?? cuentaInicial ?? { id: cuentaId }
        const actualizada = await sincronizarEstatusCuentaPorSaldo(
          supabase,
          { ...base, total: totalSync },
          pagosSync,
          { totalVenta: totalSync },
        )
        setCuentaInfo(actualizada)
      } else {
        const list = readLs(LS_CUENTAS, [])
        const prev = list.find((c) => sameId(c.id, cuentaId)) ?? { id: cuentaId }
        const pagado = pagosSync.reduce((s, p) => s + Number(p.pago ?? 0), 0)
        const adeudo = Math.max(0, totalSync - pagado)
        let next = { ...prev, total: totalSync, saldo: adeudo }
        if (adeudo > 0.01) {
          next = { ...next, estatus: 'PENDIENTE', fecha_liquidada: null }
        } else if (totalSync <= 0.0001 && pagado > 0.0001) {
          next = { ...next, total: totalSync, saldo: 0, estatus: 'PENDIENTE', fecha_liquidada: null }
        } else if (totalSync > 0.0001 && pagado >= totalSync - 0.01) {
          const est = String(prev.estatus ?? '').toUpperCase()
          if (est === 'LIQUIDADA') {
            next = {
              ...next,
              total: totalSync,
              saldo: 0,
              estatus: 'LIQUIDADA',
              fecha_liquidada: prev.fecha_liquidada ?? new Date().toISOString(),
            }
          } else if (est === 'PAGADA') {
            next = { ...next, total: totalSync, saldo: 0, estatus: 'PAGADA', fecha_liquidada: null }
          } else {
            next = { ...next, total: totalSync, saldo: 0, estatus: 'PENDIENTE', fecha_liquidada: null }
          }
        }
        writeLs(LS_CUENTAS, list.map((c) => (sameId(c.id, cuentaId) ? next : c)))
        setCuentaInfo(next)
      }
    } catch (e) {
      onError?.(`Error al guardar total: ${e.message}`)
    }
  }, [supabase, cuentaId, totalCargos, lineas, cuentaInfo, cuentaInicial, onError, recargarCuentaInfoDesdeServidor, ordenVinculadaId])

  useEffect(() => {
    if (!esCuentaExistente || loading) return
    const t = setTimeout(() => void persistirTotalCuenta(), 600)
    return () => clearTimeout(t)
  }, [totalCargos, esCuentaExistente, loading, persistirTotalCuenta])

  async function crearCuentaVacia() {
    if (!cliente.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    const row = {
      cliente_id: cliente.id,
      total: 0,
      saldo: 0,
      estatus: 'PENDIENTE',
      tipo_pago: 'EFECTIVO',
      repara_id: null,
    }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').insert(row).select('*').single()
        if (error) throw error
        setCuentaInfo(data)
        setReparaIdCuenta(data?.repara_id ?? null)
      } else {
        const nuevo = { id: nextLocalId(), ...row }
        const list = readLs(LS_CUENTAS, [])
        writeLs(LS_CUENTAS, [nuevo, ...list])
        setCuentaInfo(nuevo)
        setReparaIdCuenta(null)
      }
      onNotice?.('Cuenta creada: ya puede agregar pagos o productos')
    } catch (e) {
      onError?.(`Error al crear cuenta: ${e.message}`)
    }
  }

  async function abrirModalPago() {
    if (!cuentaId) {
      onError?.('Cree la cuenta con «Crear cuenta» antes de agregar pagos')
      return
    }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('catalogopagos').select('*')
        if (error) throw error
        setCatalogo(data ?? [])
      } else {
        setCatalogo(readLs(LS_CAT, []))
      }
      setBusqCat('')
      setSelCat(null)
      setModalPago(true)
    } catch (e) {
      onError?.(`Error al cargar catálogo: ${e.message}`)
    }
  }

  function pagarAdeudoTotalCuenta() {
    if (!cuentaId) {
      onError?.('No hay cuenta para liquidar')
      return
    }
    const monto = Number(saldoPendiente)
    if (!Number.isFinite(monto) || monto <= 0.0001) {
      onError?.('No hay adeudo pendiente en esta cuenta')
      return
    }
    setModalFormaPagoTotal(true)
  }

  function debePreguntarEstatusTrasPagoCompleto(lineasUi) {
    const est = String(cuentaInfo?.estatus ?? cuentaInicial?.estatus ?? '').toUpperCase()
    if (est === 'LIQUIDADA' || est === 'PAGADA') return false
    if (totalCargosDesdeLineas(lineasUi) <= 0.0001) return false
    return calcularSaldoPendiente(lineasUi, totalCargos) <= 0.0001
  }

  async function aplicarCuentaPagadaActivaDesdePantalla() {
    if (!cuentaId) return
    const totalCuenta = Math.max(totalCargosDesdeLineas(lineas), Number(cuentaInfo?.total ?? 0))
    let pagosSync = pagosDesdeLineas(lineas)
    if (supabase) {
      const { data: pagosDb, error: ePag } = await supabase
        .from('pagosclientes')
        .select('*')
        .eq('cuenta_id', cuentaId)
      if (!ePag && (pagosDb ?? []).length) pagosSync = pagosDb
    }
    const base = cuentaInfo ?? cuentaInicial ?? { id: cuentaId }
    if (supabase) {
      const actualizada = await aplicarCuentaPagadaActiva(supabase, base, pagosSync, {
        totalVenta: totalCuenta,
      })
      estatusElegidoManualRef.current = 'PAGADA'
      const refreshed = await recargarCuentaInfoDesdeServidor(cuentaId)
      setCuentaInfo(refreshed ?? actualizada)
    } else {
      const list = readLs(LS_CUENTAS, [])
      const patch = {
        total: totalCuenta,
        saldo: 0,
        estatus: 'PAGADA',
        fecha_liquidada: null,
      }
      writeLs(LS_CUENTAS, list.map((c) => (sameId(c.id, cuentaId) ? { ...c, ...patch } : c)))
      estatusElegidoManualRef.current = 'PAGADA'
      setCuentaInfo((prev) => (prev ? { ...prev, ...patch } : { id: cuentaId, ...patch }))
    }
  }

  async function elegirLiquidarCuentaTrasPago() {
    setModalEstatusPagoCero(false)
    const ok = await aplicarLiquidacionCuenta({ avisar: false })
    onNotice?.(
      ok
        ? 'Cuenta liquidada. La orden se marcó como entregada.'
        : 'No se pudo liquidar la cuenta.',
    )
  }

  async function elegirCuentaActivaPagadaTrasPago() {
    setModalEstatusPagoCero(false)
    try {
      await aplicarCuentaPagadaActivaDesdePantalla()
      onNotice?.(
        'Cuenta activa y pagada (saldo $0). La orden permanece pendiente de entrega hasta que la marque entregada.',
      )
    } catch (e) {
      onError?.(`Error al guardar cuenta pagada: ${e.message}`)
    }
  }

  async function ejecutarPagoAdeudoTotal(formaPagoElegida) {
    if (pagandoAdeudoRef.current) return
    if (!cuentaId) {
      onError?.('No hay cuenta para liquidar')
      return
    }
    const monto = Number(saldoPendiente)
    if (!Number.isFinite(monto) || monto <= 0.0001) {
      onError?.('No hay adeudo pendiente en esta cuenta')
      return
    }
    pagandoAdeudoRef.current = true
    setPagandoAdeudoTotal(true)
    const row = {
      cliente_id: cliente.id,
      cuenta_id: cuentaId,
      pago: monto,
      concepto: 'Pago adeudo total',
      forma_pago: formaPagoElegida,
    }
    try {
      const pagoGuardado = await insertPagoCliente(supabase, row, { nextLocalId })
      const lineasNuevas = [...lineas, crearLineaPago(pagoGuardado)]
      setLineas(lineasNuevas)
      setModalFormaPagoTotal(false)
      setModalPago(false)
      if (debePreguntarEstatusTrasPagoCompleto(lineasNuevas)) {
        setModalEstatusPagoCero(true)
        onNotice?.(`Pago registrado ($${monto.toFixed(2)}) — ${formaPagoElegida}`)
      } else {
        await persistirTotalCuenta()
        onNotice?.(`Pago registrado ($${monto.toFixed(2)}) — ${formaPagoElegida}`)
      }
    } catch (e) {
      onError?.(`Error al pagar adeudo total: ${e.message}`)
    } finally {
      pagandoAdeudoRef.current = false
      setPagandoAdeudoTotal(false)
    }
  }

  async function registrarPago() {
    if (!selCat || !cuentaId) {
      onError?.('Seleccione concepto de pago')
      return
    }
    const cant = Number(cantPago)
    const val = Number(valorPago)
    if (!Number.isFinite(cant) || !Number.isFinite(val)) {
      onError?.('Cantidad y valor numéricos requeridos')
      return
    }
    const monto = cant * val
    const row = {
      cliente_id: cliente.id,
      cuenta_id: cuentaId,
      pago: monto,
      concepto: selCat.concepto ?? 'Pago',
      forma_pago: formaPago,
    }
    try {
      const pagoGuardado = await insertPagoCliente(supabase, row, { nextLocalId })
      const nuevasLineas = [...lineas, crearLineaPago(pagoGuardado)]
      setLineas(nuevasLineas)
      setModalPago(false)
      if (debePreguntarEstatusTrasPagoCompleto(nuevasLineas)) {
        setModalEstatusPagoCero(true)
        onNotice?.('Pago registrado. Saldo en $0.00.')
      } else {
        await persistirTotalCuenta()
        onNotice?.('Pago agregado')
      }
    } catch (e) {
      onError?.(`Error al registrar pago: ${e.message}`)
    }
  }

  async function abrirSelectorProductos() {
    if (!cuentaId) {
      onError?.('Cree la cuenta con «Crear cuenta» antes de agregar productos')
      return
    }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('productos').select('*')
        if (error) throw error
        setTodosProductos(data ?? [])
      } else {
        setTodosProductos(readLs(LS_PRODUCTOS, []))
      }
      let desdeMovs = []
      try {
        desdeMovs = await recientesProductosDesdeCuentamov(supabase, () => readLs(LS_CUENTAMOV, []))
      } catch (eMov) {
        console.warn('No se pudo ordenar por uso reciente en cuentamov:', eMov.message)
      }
      setRecientesProductosIds(mergeRecientesProductos(leerRecientesProductosVentas(), desdeMovs))
      setBusqProd('')
      setModalProductos(true)
    } catch (e) {
      onError?.(`Error al cargar productos: ${e.message}`)
    }
  }

  function resolverContableProducto(productoId, fallbackContable = true) {
    const p = todosProductos.find((x) => sameId(x.id, productoId))
    if (p) return esProductoContable(p)
    return fallbackContable
  }

  function cambiarVistaSelectorProductos(modo) {
    setVistaSelectorProductos(modo)
    try {
      localStorage.setItem(LS_VISTA_SELECTOR_PRODUCTOS, modo)
    } catch {
      /* ignore */
    }
  }

  function limpiarFormularioProducto() {
    setSerieProd('')
    setDescProd('')
    setExistencia('')
    setCantProd('')
    setPrecioProd('')
    setProductoIdSel(0)
    setProductoContableSel(true)
  }

  function cerrarCapturaProducto() {
    setMostrarCamposProducto(false)
    limpiarFormularioProducto()
  }

  function seleccionarProducto(p) {
    setRecientesProductosIds(registrarProductoRecienteVentas(p.id))
    const esContable = esProductoContable(p)
    setProductoIdSel(Number(p.id) || 0)
    setProductoContableSel(esContable)
    setSerieProd(String(p.serie ?? '').toUpperCase())
    setDescProd(String(p.descripcion ?? '').toUpperCase())
    setExistencia(esContable ? String(p.existencia ?? '') : etiquetaExistencia(p))
    setPrecioProd(String(p.precio_venta ?? ''))
    setCantProd('')
    setModalProductos(false)
    setMostrarCamposProducto(true)
  }

  async function agregarProductoLinea() {
    if (!serieProd.trim()) {
      onError?.('La serie del producto es requerida')
      return
    }
    if (!descProd.trim()) {
      onError?.('La descripción del producto es requerida')
      return
    }
    if (!productoIdSel) {
      onError?.('Seleccione un producto del catálogo')
      return
    }
    const cant = Number(cantProd)
    const precio = Number(precioProd)
    if (!Number.isFinite(cant) || cant <= 0) {
      onError?.('La cantidad debe ser mayor a 0')
      return
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      onError?.('El precio unitario debe ser mayor a 0')
      return
    }
    const sub = cant * precio
    if (!cuentaId) {
      onError?.('Genere o seleccione una cuenta antes de agregar productos')
      return
    }
    const esContableVenta = resolverContableProducto(productoIdSel, productoContableSel)
    if (esContableVenta) {
      const stockDisp = Number(existencia)
      if (Number.isFinite(stockDisp) && cant > stockDisp) {
        onError?.(`Stock insuficiente. Disponible: ${stockDisp}`)
        return
      }
    }
    try {
      const { movId: nuevoId } = await registrarVentaEnCuenta({
        supabase,
        cuentaId,
        productoId: productoIdSel,
        descripcion: descProd.trim(),
        cantidad: cant,
        precio,
        nextLocalId,
      })
      setLineas((prev) => [
        ...prev,
        {
          key: `cuentamov_${nuevoId}`,
          tipo: 'cuentamov',
          dbId: nuevoId,
          producto_id: productoIdSel,
          contable: esContableVenta,
          cantidad: cant,
          descripcion: `[VENTA] ${descProd.trim()}`,
          precioUnitario: precio,
          subtotal: sub,
        },
      ])
      setRecientesProductosIds(registrarProductoRecienteVentas(productoIdSel))
      cerrarCapturaProducto()
      onNotice?.(
        esContableVenta ? 'Producto agregado · inventario actualizado' : 'Servicio agregado a la cuenta',
      )
    } catch (e) {
      onError?.(`Error al agregar línea: ${e.message}`)
    }
  }

  async function eliminarLinea(L) {
    if (!puedeEliminar) {
      mostrarSinPermiso()
      return
    }
    if (!confirm('¿Eliminar este elemento de la lista?')) return
    try {
      if (L.tipo === 'reparamov' && L.dbId != null) {
        if (supabase) {
          await deleteSupabaseVerificado(supabase, 'reparamov', (q) => q.eq('id', L.dbId))
        } else {
          writeLs(
            LS_REPARAMOV,
            readLs(LS_REPARAMOV, []).filter((x) => !sameId(x.id, L.dbId)),
          )
        }
      } else if (L.tipo === 'cuentamov' && L.dbId != null) {
        const prodId = Number(L.producto_id)
        const cantLinea = Number(L.cantidad)
        if (supabase) {
          await deleteSupabaseVerificado(supabase, 'cuentamov', (q) => q.eq('id', L.dbId))
        } else {
          writeLs(
            LS_CUENTAMOV,
            readLs(LS_CUENTAMOV, []).filter((x) => !sameId(x.id, L.dbId)),
          )
        }
        if (prodId > 0 && Number.isFinite(cantLinea) && cantLinea > 0 && L.contable !== false) {
          await reponerExistencia(supabase, prodId, cantLinea)
        }
      } else if (L.virtual) {
        setLineas((prev) => prev.filter((x) => x.key !== L.key))
        onNotice?.('Cargo de referencia quitado de la lista (no estaba guardado en movimientos)')
        return
      } else if (L.tipo === 'pago' && L.dbId != null) {
        if (supabase) {
          await deleteSupabaseVerificado(supabase, 'pagosclientes', (q) => q.eq('id', L.dbId))
        } else {
          writeLs(
            LS_PAGOS,
            readLs(LS_PAGOS, []).filter((x) => !sameId(x.id, L.dbId)),
          )
        }
      }
      setLineas((prev) => prev.filter((x) => x.key !== L.key))
      onNotice?.('Eliminado')
    } catch (e) {
      onError?.(`Error al eliminar: ${e.message}`)
    }
  }

  async function aplicarLiquidacionCuenta({ avisar = true, totalOverride = null } = {}) {
    if (!cuentaId) return false
    const cargos = totalCargosDesdeLineas(lineas)
    const pagosUi = pagosDesdeLineas(lineas)
    const esGarantiaCero = esGarantiaSinCobro && cargos <= 0.0001

    if (!esGarantiaCero) {
      if (cuentaTieneSoloAnticipo(cargos, pagosUi)) {
        if (avisar) {
          onError?.(
            'No se puede liquidar: solo hay anticipo. La cuenta sigue pendiente hasta registrar el servicio y el pago total.',
          )
        }
        return false
      }
      if (cargos <= 0.0001) {
        if (avisar) {
          onError?.('No se puede liquidar: agregue cargos a la cuenta antes de cerrarla.')
        }
        return false
      }
      const saldoNet =
        totalOverride != null ? Number(totalOverride) : calcularSaldoPendiente(lineas, totalCargos)
      if (saldoNet > 0.0001) {
        if (avisar) {
          onError?.(`No se puede liquidar: aún hay saldo pendiente de $${saldoNet.toFixed(2)}.`)
        }
        return false
      }
      const pagosUiTotal = sumMontoPagos(pagosUi)
      if (pagosUiTotal < cargos - 0.01) {
        if (avisar) {
          onError?.(
            `Registre el pago antes de liquidar: cargos $${cargos.toFixed(2)}, pagos registrados $${pagosUiTotal.toFixed(2)}.`,
          )
        }
        return false
      }
      if (supabase && cargos > 0.01) {
        const { data: pagosDb, error: ePag } = await supabase
          .from('pagosclientes')
          .select('pago')
          .eq('cuenta_id', cuentaId)
        if (!ePag) {
          const pagadoDb = sumPagosCuenta(pagosDb ?? [])
          if (pagadoDb < cargos - 0.01) {
            if (avisar) {
              onError?.(
                `Faltan pagos en la base de datos ($${(cargos - pagadoDb).toFixed(2)}). Use «Agregar pago» o «Pagar adeudo total» antes de liquidar.`,
              )
            }
            return false
          }
        }
      }
    }

    const totalCuenta = esGarantiaCero
      ? 0
      : Math.max(totalCargosDesdeLineas(lineas), Number(cuentaInfo?.total ?? 0))
    const nowLiq = new Date().toISOString()
    const patchLiq = {
      total: totalCuenta,
      saldo: 0,
      estatus: 'LIQUIDADA',
      fecha_liquidada: nowLiq,
      updated_at: nowLiq,
    }
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuentaId, patchLiq)
      estatusElegidoManualRef.current = 'LIQUIDADA'
      const refreshed = await recargarCuentaInfoDesdeServidor(cuentaId)
      if (refreshed) setCuentaInfo(refreshed)
      else setCuentaInfo((prev) => ({ ...(prev ?? { id: cuentaId }), ...patchLiq }))
    } else {
      const list = readLs(LS_CUENTAS, [])
      writeLs(
        LS_CUENTAS,
        list.map((c) => (sameId(c.id, cuentaId) ? { ...c, ...patchLiq } : c)),
      )
      const ridLiq = ordenVinculadaId ?? reparaIdCuenta
      if (ridLiq != null) {
        const lr = readLs(LS_REP, [])
        const repRow = lr.find((r) => sameId(r.id, ridLiq)) ?? {}
        const patchEnt = patchOrdenEntregadaSiAplica(repRow)
        if (patchEnt) {
          writeLs(
            LS_REP,
            lr.map((r) => (sameId(r.id, ridLiq) ? { ...r, ...patchEnt } : r)),
          )
        }
      }
      estatusElegidoManualRef.current = 'LIQUIDADA'
      setCuentaInfo((prev) => ({ ...(prev ?? { id: cuentaId }), ...patchLiq }))
    }
    return true
  }

  async function liquidarCuenta() {
    try {
      const ok = await aplicarLiquidacionCuenta({ avisar: true })
      if (ok) onNotice?.('Cuenta liquidada. La orden se marcó como entregada.')
    } catch (e) {
      onError?.(`Error al liquidar: ${e.message}`)
    }
  }

  function abrirModalNotificarCliente() {
    setErrorNotificacion('')
    setMensajeNotificacionEditado(
      buildMensajeNotificacionCuentaCliente({
        nombreCliente: cliente.nombre,
        lineas,
        saldoPendiente,
      }),
    )
    setModalNotificarCliente(true)
  }

  async function copiarMensajeNotificacion() {
    const texto = mensajeNotificacionEditado.trim()
    if (!texto) {
      onError?.('El mensaje está vacío')
      return
    }
    try {
      await navigator.clipboard.writeText(texto)
      onNotice?.('Mensaje copiado al portapapeles')
    } catch {
      onError?.('No se pudo copiar el mensaje')
    }
  }

  function enviarNotificacionWhatsApp() {
    const texto = mensajeNotificacionEditado.trim()
    if (!texto) {
      onError?.('El mensaje está vacío')
      return
    }
    if (!cliente.telefono?.trim()) {
      onError?.('El teléfono del cliente es requerido para enviar por WhatsApp')
      return
    }
    const url = buildWhatsAppUrl({ telefono: cliente.telefono, mensaje: texto })
    if (!url) {
      onError?.('Teléfono del cliente no válido para WhatsApp')
      return
    }
    const win = window.open(url, '_blank', 'noopener')
    if (!win) onError?.('No se pudo abrir WhatsApp (ventana bloqueada)')
  }

  async function confirmarEnvioNotificacion() {
    const rid = ordenVinculadaId
    if (rid == null) {
      const msg = 'Esta cuenta no tiene orden de servicio vinculada; no se puede registrar en la bitácora.'
      setErrorNotificacion(msg)
      onError?.(msg)
      return
    }
    setConfirmandoEnvioNotificacion(true)
    setErrorNotificacion('')
    try {
      const resultado = await registrarNotificacionClienteEnBitacora(supabase, rid, {
        leerBitacoraLocal: (idOrden) => {
          const rep = readLs(LS_REP, []).find((r) => sameId(r.id, idOrden))
          return rep?.bitacora ?? ''
        },
        escribirBitacoraLocal: (idOrden, bitacoraNueva, updatedAt) => {
          const all = readLs(LS_REP, [])
          const idx = all.findIndex((r) => sameId(r.id, idOrden))
          if (idx < 0) throw new Error(`No se encontró la orden #${idOrden}.`)
          all[idx] = { ...all[idx], bitacora: bitacoraNueva, updated_at: updatedAt }
          writeLs(LS_REP, all)
        },
      })
      setModalNotificarCliente(false)
      setDetalleExitoNotificacion(
        `${resultado.nota} — ${formatFechaBitacora(resultado.fechaHora)}`,
      )
      setModalExitoNotificacion(true)
      onNotice?.('Nota agregada con éxito')
    } catch (e) {
      const msg = e?.message ?? String(e)
      setErrorNotificacion(msg)
      onError?.(`No se pudo registrar en la bitácora: ${msg}`)
    } finally {
      setConfirmandoEnvioNotificacion(false)
    }
  }

  async function enviarComprobante({ modo = 'cuenta', fechaYmd = ymdHoyLocal() } = {}) {
    if (!esCuentaExistente) {
      onError?.('Cree o abra una cuenta antes de imprimir el recibo.')
      return
    }
    if (loading) {
      onNotice?.('Espere a que termine de cargar la cuenta.')
      return
    }
    if (imprimiendoRecibo) return

    const lineasPdf = lineasReciboPorModo(lineas, modo, fechaYmd)
    if (modo === 'pagos_fecha') {
      if (lineasPdf.length === 0) {
        const fechaTxt = formatFechaLegibleEsMx(fechaYmd, {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
        onError?.(`No hay pagos registrados el ${fechaTxt} en esta cuenta.`)
        return
      }
    }

    setImprimiendoRecibo(true)
    try {
      const esPagosFecha = modo === 'pagos_fecha'
      const importePagosDia = sumImportePagosLineas(lineasPdf)
      const totalPdf = esPagosFecha
        ? importePagosDia
        : Number.isFinite(visiblesCuenta.totalDisplay)
          ? visiblesCuenta.totalDisplay
          : totalCargos
      const saldoPdf = esPagosFecha
        ? Math.max(0, calcularSaldoPendiente(lineas, totalCargos))
        : Number.isFinite(visiblesCuenta.saldoDisplay)
          ? visiblesCuenta.saldoDisplay
          : balanceNeto
      const fechaTxt = formatFechaLegibleEsMx(fechaYmd, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })

      await printReciboCuentaPdf({
        cliente: { nombre: cliente.nombre || 'Cliente', telefono: cliente.telefono || '' },
        orden: reciboOrdenEquipo?.orden ?? reparaIdCuenta ?? ordenVinculadaId ?? null,
        descripcionEquipo: reciboOrdenEquipo?.descripcionEquipo ?? '',
        total: totalPdf,
        saldo: saldoPdf,
        estatus: cuentaEstatus || '—',
        lineas: lineasPdf,
        tituloDocumento: esPagosFecha ? 'COMPROBANTE DE PAGO' : 'COMPROBANTE',
        subtitulo: esPagosFecha ? `Pagos del ${fechaTxt}` : null,
        labelTotal: esPagosFecha ? 'Importe pagado' : 'Total',
        labelSaldo: esPagosFecha ? 'Saldo pendiente' : 'Saldo',
        ocultarSaldo: esPagosFecha && saldoPdf <= 0.0001,
      })
      setModalImprimirRecibo(false)
      onNotice?.(RECIBO_PRINT_HINT)
    } catch (e) {
      const msg = String(e?.message ?? e)
      if (/popup|bloque/i.test(msg)) {
        onError?.('El navegador bloqueó la ventana de impresión. Permita ventanas emergentes e intente de nuevo.')
      } else       if (/tiempo de espera/i.test(msg)) {
        onError?.('El recibo tardó en cargar. Intente de nuevo o use otro navegador (Chrome o Edge).')
      } else if (/fetch|import|module|dynamically/i.test(msg)) {
        onError?.(
          'No se pudo cargar el módulo del recibo. Recargue la página (Ctrl+F5) e intente de nuevo.',
        )
      } else {
        onError?.(`No se pudo imprimir el recibo: ${msg}`)
      }
    } finally {
      setImprimiendoRecibo(false)
    }
  }

  async function vincularCuentaAOrdenServicio() {
    if (!cuentaId) {
      onError?.('No hay cuenta para vincular')
      return
    }
    const rid = normalizarReparacionId(ordenVinculoInput)
    if (rid == null) {
      onError?.('Indique el número de orden de servicio válido')
      return
    }
    setVinculandoOrden(true)
    try {
      if (supabase) {
        const vinculada = await vincularCuentaAOrdenSupabase(supabase, cuentaId, rid)
        setCuentaInfo(vinculada)
        setReparaIdCuenta(rid)
        await cargarTodo(cuentaId, rid)
      } else {
        const list = readLs(LS_CUENTAS, [])
        const idx = list.findIndex((c) => sameId(c.id, cuentaId))
        if (idx < 0) throw new Error(`No se encontró la cuenta #${cuentaId}.`)
        const vinculada = { ...list[idx], repara_id: rid }
        writeLs(
          LS_CUENTAS,
          list.map((c) => (sameId(c.id, cuentaId) ? vinculada : c)),
        )
        setCuentaInfo(vinculada)
        setReparaIdCuenta(rid)
        await cargarTodo(cuentaId, rid)
      }
      onNotice?.(`Cuenta #${cuentaId} vinculada a la orden #${rid}.`)
    } catch (e) {
      onError?.(`No se pudo vincular: ${e.message}`)
    } finally {
      setVinculandoOrden(false)
    }
  }

  return (
    <div className="ventas-cuenta-root">
      <AlertaPermiso mensaje={alertaPermiso} />
      <header className="ventas-cuenta-header">
        <h1>Cuentas</h1>
      </header>

      <div className="ventas-cuenta-body">
        <section className="ventas-cliente-card card-pad">
          <h2 className="ventas-cliente-nombre">{cliente.nombre || 'Cliente'}</h2>
          <p className="muted">Tel: {cliente.telefono || '—'}</p>
          {cliente.domicilio ? <p className="muted small">{cliente.domicilio}</p> : null}
          {cuentaId ? (
            <p className="muted small">
              Cuenta #{cuentaId}
              {reparaIdCuenta != null ? ` · No de Orden: ${reparaIdCuenta}` : ''}
            </p>
          ) : (
            <div className="ventas-nueva-cuenta-row">
              <p className="muted small">Nueva cuenta — cree el registro antes de agregar líneas.</p>
              <button type="button" className="btn-crear-cuenta-ventas" onClick={() => void crearCuentaVacia()}>
                ➕ Crear cuenta
              </button>
            </div>
          )}
        </section>

        {cuentaRequiereVinculoOrden ? (
          <section className="ventas-aviso-vincular-cuenta" role="alert">
            <p className="ventas-aviso-vincular-cuenta-titulo">
              <strong>Vincular cuenta a orden de servicio</strong>
            </p>
            <p className="ventas-aviso-vincular-cuenta-texto muted small">
              La cuenta #{cuentaId} no está ligada a ninguna orden. Indique el número de orden del mismo cliente y
              confirme la vinculación.
            </p>
            <div className="ventas-aviso-vincular-cuenta-row">
              <label className="ventas-aviso-vincular-cuenta-label" htmlFor="ventas-orden-vinculo">
                No. de orden
              </label>
              <input
                id="ventas-orden-vinculo"
                type="text"
                inputMode="numeric"
                className="ventas-aviso-vincular-cuenta-input"
                value={ordenVinculoInput}
                disabled={vinculandoOrden}
                onChange={(e) => setOrdenVinculoInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej. 422"
              />
              <button
                type="button"
                className="btn-vincular-cuenta-orden"
                disabled={vinculandoOrden || !String(ordenVinculoInput ?? '').trim()}
                onClick={() => void vincularCuentaAOrdenServicio()}
              >
                {vinculandoOrden ? 'Vinculando…' : 'Vincular cuenta'}
              </button>
            </div>
          </section>
        ) : null}

        <section className="ventas-seccion">
          <h3 className="ventas-seccion-titulo">Lista de Productos (Ventas + Reparaciones)</h3>
          {loading ? (
            <p className="center">Cargando…</p>
          ) : (
            <TablaScrollSuperior
              ariaLabel="Lista de productos de la cuenta"
              classNameWrap="ventas-tabla-scroll-outer"
              syncDeps={[lineas, loading]}
            >
            <div className="ventas-tabla-wrap">
              <div className="ventas-tabla-head">
                <span>Cant</span>
                <span>Descripción</span>
                <span>Fecha</span>
                <span>Precio</span>
                <span>Subtotal</span>
                <span />
              </div>
              {lineas.length === 0 ? (
                <div className="ventas-tabla-vacia">Los productos agregados aparecerán aquí</div>
              ) : (
                <ul className="ventas-tabla-lista">
                  {lineas.map((L, idx) => {
                    const esPago = L.tipo === 'pago'
                    const cantDisp = esPago ? Math.abs(Number(L.cantidad)) : Number(L.cantidad)
                    return (
                      <li
                        key={L.key}
                        className={`ventas-tabla-fila ${esPago ? 'es-pago' : ''} ${idx % 2 ? 'stripe' : ''}`}
                      >
                        <span>{cantDisp}</span>
                        <span>{L.descripcion}</span>
                        <span className={`ventas-tabla-fecha${esPago ? ' ventas-tabla-fecha--pago' : ''}`}>
                          {esPago ? L.fechaPago ?? '—' : '—'}
                        </span>
                        <span>${Number(L.precioUnitario).toFixed(2)}</span>
                        <span>${Number(L.subtotal).toFixed(2)}</span>
                        <button
                          type="button"
                          className="btn-elim-linea"
                          onClick={() => intentarEliminar(() => void eliminarLinea(L))}
                          aria-label="Eliminar"
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            </TablaScrollSuperior>
          )}
        </section>

        <button type="button" className="btn-agregar-pago-ventas" onClick={() => void abrirModalPago()}>
          💰 AGREGAR PAGO
        </button>

        <button
          type="button"
          className={
            mostrarCamposProducto || modalProductos ? 'btn-agregar-prod-ventas abierto' : 'btn-agregar-prod-ventas'
          }
          onClick={() => void abrirSelectorProductos()}
        >
          📦 Agregar Producto/Servicio
        </button>

        <div className="ventas-cuenta-resumen" role="group" aria-label="Total y saldo de la cuenta">
          <div
            className={`ventas-cuenta-recuadro ventas-cuenta-recuadro--total${saldoAFavor ? ' ventas-cuenta-recuadro--saldo-favor' : ''}`}
          >
            <span className="ventas-cuenta-recuadro-etiqueta">{saldoAFavor ? 'Total (anticipo)' : 'Total'}</span>
            <span className="ventas-cuenta-recuadro-monto">{totalStr}</span>
          </div>
          <div
            className={`ventas-cuenta-recuadro ventas-cuenta-recuadro--saldo${saldoPendiente > 0.0001 ? ' ventas-cuenta-recuadro--saldo-pend' : saldoAFavor ? ' ventas-cuenta-recuadro--saldo-cero' : ''}`}
          >
            <span className="ventas-cuenta-recuadro-etiqueta">Saldo</span>
            <span className="ventas-cuenta-recuadro-monto">{saldoStr}</span>
          </div>
        </div>

        <label className="ventas-total-block">
          <span>Estatus de la Cuenta</span>
          <input value={cuentaEstatus || '—'} readOnly className="readonly-field" />
        </label>

        {esGarantiaSinCobro ? (
          <p className="ventas-garantia-sin-cobro-aviso" role="status">
            <strong>{etiquetaGarantiaSinCobro(tipoReparacionOrden)}</strong> — sin cobro. Al liquidar la cuenta en{' '}
            <strong>$0.00</strong>, la orden vinculada pasa a <strong>ENTREGADO</strong> (igual que cualquier otra
            cuenta liquidada).
          </p>
        ) : null}

        <div className="ventas-acciones">
          {puedeLiquidarCuenta ? (
            <button
              type="button"
              className="btn-liquidar-cuenta"
              onClick={() => void liquidarCuenta()}
              title="Cierra la cuenta y marca la orden vinculada como entregada"
            >
              {esGarantiaSinCobro ? '✅ LIQUIDAR GARANTÍA ($0)' : '✅ LIQUIDAR CUENTA'}
            </button>
          ) : null}
          {esCuentaExistente ? (
            <button
              type="button"
              className="btn-notificar-cliente"
              onClick={() => abrirModalNotificarCliente()}
            >
              📱 NOTIFICAR AL CLIENTE
            </button>
          ) : null}
          <button
            type="button"
            className="btn-comprobante-ventas"
            disabled={!esCuentaExistente || loading || imprimiendoRecibo}
            onClick={() => {
              setModoRecibo('cuenta')
              setFechaReciboPagos(fechasPagosCuenta[0]?.ymd ?? '')
              setModalImprimirRecibo(true)
            }}
            title={
              !esCuentaExistente
                ? 'Cree la cuenta antes de imprimir el recibo'
                : loading
                  ? 'Cargando movimientos de la cuenta…'
                  : 'Elegir recibo de cuenta completa o solo pagos de una fecha'
            }
          >
            {imprimiendoRecibo ? 'Preparando recibo…' : '📧 IMPRIMIR RECIBO'}
          </button>
          <button type="button" className="btn-salir-ventas" onClick={onSalir}>
            ❌ SALIR
          </button>
        </div>
      </div>

      {modalImprimirRecibo && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !imprimiendoRecibo && setModalImprimirRecibo(false)}
        >
          <div
            className="modal modal-confirmar-datos ventas-recibo-modal"
            role="dialog"
            aria-labelledby="ventas-recibo-modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="ventas-recibo-modal-titulo">Imprimir recibo</h3>
            </div>
            <div className="modal-body">
              <p className="ventas-recibo-modal-lead muted">
                Elija si el comprobante incluye toda la cuenta o solo los pagos de una fecha.
              </p>
              <div className="ventas-recibo-opciones" role="radiogroup" aria-label="Tipo de recibo">
                <label className="ventas-recibo-opcion">
                  <input
                    type="radio"
                    name="modo-recibo"
                    value="cuenta"
                    checked={modoRecibo === 'cuenta'}
                    onChange={() => setModoRecibo('cuenta')}
                  />
                  <span className="ventas-recibo-opcion-texto">
                    <strong>Cuenta completa</strong>
                    <span className="muted small">
                      Todos los cargos y pagos · Total {totalStr} · Saldo {saldoStr}
                    </span>
                  </span>
                </label>
                <label
                  className={`ventas-recibo-opcion${fechasPagosCuenta.length === 0 ? ' ventas-recibo-opcion--disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="modo-recibo"
                    value="pagos_fecha"
                    checked={modoRecibo === 'pagos_fecha'}
                    disabled={fechasPagosCuenta.length === 0}
                    onChange={() => {
                      setModoRecibo('pagos_fecha')
                      if (fechasPagosCuenta[0]) setFechaReciboPagos(fechasPagosCuenta[0].ymd)
                    }}
                  />
                  <span className="ventas-recibo-opcion-texto">
                    <strong>Solo pagos de una fecha</strong>
                    <span className="muted small">
                      {fechasPagosCuenta.length === 0
                        ? 'Esta cuenta aún no tiene pagos registrados.'
                        : 'Elija un día con pagos registrados en esta cuenta.'}
                    </span>
                  </span>
                </label>
              </div>
              {modoRecibo === 'pagos_fecha' && fechasPagosCuenta.length > 0 ? (
                <div className="ventas-recibo-fecha-block">
                  <label className="ventas-recibo-fecha-label" htmlFor="ventas-recibo-fecha-pagos">
                    Fecha con pagos
                  </label>
                  <select
                    id="ventas-recibo-fecha-pagos"
                    className="ventas-recibo-fecha-input ventas-recibo-fecha-select"
                    value={fechaReciboPagos}
                    onChange={(e) => setFechaReciboPagos(e.target.value)}
                  >
                    {fechasPagosCuenta.map((f) => (
                      <option key={f.ymd} value={f.ymd}>
                        {f.label} — {f.count} pago(s) · {formatMontoCuenta(f.importe)}
                      </option>
                    ))}
                  </select>
                  <p className="ventas-recibo-fecha-resumen muted small" role="status">
                    {`${pagosEnFechaRecibo.count} pago(s) · Importe ${formatMontoCuenta(pagosEnFechaRecibo.importe)}`}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                disabled={imprimiendoRecibo}
                onClick={() => setModalImprimirRecibo(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-comprobante-ventas"
                disabled={
                  imprimiendoRecibo ||
                  (modoRecibo === 'pagos_fecha' && pagosEnFechaRecibo.count === 0)
                }
                onClick={() =>
                  void enviarComprobante({
                    modo: modoRecibo,
                    fechaYmd: modoRecibo === 'pagos_fecha' ? fechaReciboPagos : undefined,
                  })
                }
              >
                {imprimiendoRecibo ? 'Preparando…' : '🖨 Imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalPago && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalPago(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agregar pago</h3>
            </div>
            <div className="modal-body">
              <button
                type="button"
                className="btn-pagar-adeudo-total"
                onClick={pagarAdeudoTotalCuenta}
                disabled={!puedePagarAdeudoTotal || pagandoAdeudoTotal}
                title={
                  saldoPendiente > 0.0001
                    ? 'Registrar pago por el saldo total y liquidar la cuenta'
                    : 'No hay adeudo pendiente en esta cuenta'
                }
              >
                <span aria-hidden="true">💵</span>
                <span>
                  Pagar adeudo total
                  {saldoPendiente > 0.0001 ? (
                    <>
                      {' '}
                      · <strong>${saldoPendiente.toFixed(2)}</strong>
                    </>
                  ) : null}
                </span>
              </button>
              <input className="full" placeholder="Buscar concepto…" value={busqCat} onChange={(e) => setBusqCat(e.target.value)} />
              <ul className="cat-pago-list">
                {catFiltrado.map((c) => (
                  <li key={c.id ?? c.concepto}>
                    <button
                      type="button"
                      className={`rep-card ${selCat === c ? 'selected' : ''}`}
                      onClick={() => {
                        setSelCat(c)
                        const catVal = Number(c.cantidad ?? 0)
                        let sugerido = catVal
                        if (saldoPendiente > 0.0001) {
                          sugerido = catVal > 0 ? Math.min(saldoPendiente, catVal) : saldoPendiente
                        }
                        setValorPago(sugerido > 0 ? String(sugerido) : '')
                        setCantPago('1')
                      }}
                    >
                      <strong>{c.concepto}</strong>
                      <span>${Number(c.cantidad ?? 0).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {selCat ? (
                <div className="pago-row">
                  <label>
                    Cantidad
                    <input value={cantPago} onChange={(e) => setCantPago(e.target.value)} />
                  </label>
                  <label>
                    Valor
                    <input value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
                  </label>
                  <label>
                    Forma pago
                    <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                      <option value="TARJETA">TARJETA</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalPago(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void registrarPago()} disabled={!selCat}>
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEstatusPagoCero && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalEstatusPagoCero(false)}>
          <div className="modal modal-confirmar-datos modal-alerta modal-alerta--info" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header confirmar-datos-header">
              <span className="confirmar-datos-header-ico" aria-hidden="true">
                💰
              </span>
              <div>
                <h3>Cuenta pagada (saldo $0.00)</h3>
                <p className="confirmar-datos-lead">
                  ¿Desea liquidar la cuenta o dejarla activa? Si el cliente aún no recoge, deje la cuenta activa y la
                  orden pendiente de entrega.
                </p>
              </div>
            </div>
            <div className="modal-body">
              <div className="confirmar-datos-recuadro">
                <p className="ventas-estatus-pago-opcion">
                  <strong>Liquidar cuenta:</strong> cierra la cuenta y marca la orden como entregada.
                </p>
                <p className="ventas-estatus-pago-opcion">
                  <strong>Dejar activa (pagada):</strong> saldo $0, cuenta en estatus PAGADA; la orden sigue hasta
                  marcarla entregada en servicio.
                </p>
              </div>
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="secondary" onClick={() => setModalEstatusPagoCero(false)}>
                Decidir después
              </button>
              <button type="button" className="btn-cuentas" onClick={() => void elegirCuentaActivaPagadaTrasPago()}>
                ✅ Activa pagada
              </button>
              <button type="button" className="btn-liquidar-cuenta" onClick={() => void elegirLiquidarCuentaTrasPago()}>
                ✅ Liquidar cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFormaPagoTotal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !pagandoAdeudoTotal && setModalFormaPagoTotal(false)}
        >
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 ¿Cómo se realizará el pago?</h3>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Selecciona la forma de pago para liquidar el adeudo total de{' '}
                <strong>${Number(saldoPendiente).toFixed(2)}</strong>.
              </p>
            </div>
            <div className="modal-body forma-pago-opciones">
              <button
                type="button"
                className="btn-forma-pago"
                onClick={() => void ejecutarPagoAdeudoTotal('EFECTIVO')}
                disabled={pagandoAdeudoTotal}
              >
                <span aria-hidden="true">💵</span>
                <span>Efectivo</span>
              </button>
              <button
                type="button"
                className="btn-forma-pago"
                onClick={() => void ejecutarPagoAdeudoTotal('TRANSFERENCIA')}
                disabled={pagandoAdeudoTotal}
              >
                <span aria-hidden="true">🏦</span>
                <span>Transferencia</span>
              </button>
              <button
                type="button"
                className="btn-forma-pago"
                onClick={() => void ejecutarPagoAdeudoTotal('TARJETA')}
                disabled={pagandoAdeudoTotal}
              >
                <span aria-hidden="true">💳</span>
                <span>Tarjeta de crédito o débito</span>
              </button>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setModalFormaPagoTotal(false)}
                disabled={pagandoAdeudoTotal}
              >
                Cancelar
              </button>
              {pagandoAdeudoTotal ? (
                <span className="muted small">Procesando pago…</span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {modalProductos && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalProductos(false)}>
          <div className="modal modal-wide modal-selector-productos" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Seleccionar Producto</h3>
            </div>
            <div className="modal-body modal-body--ordenes-cliente">
              <input
                className="full"
                placeholder="Buscar por serie o descripción…"
                value={busqProd}
                onChange={(e) => setBusqProd(e.target.value)}
              />
              <div
                className="cuentas-cliente-vista-bar ventas-selector-productos-vista-bar"
                role="group"
                aria-label="Forma de ver los productos"
              >
                <button
                  type="button"
                  className={`cuentas-cliente-vista-btn${vistaSelectorProductos === 'tarjetas' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                  onClick={() => cambiarVistaSelectorProductos('tarjetas')}
                  aria-pressed={vistaSelectorProductos === 'tarjetas'}
                >
                  🗂️ Tarjetas
                </button>
                <button
                  type="button"
                  className={`cuentas-cliente-vista-btn${vistaSelectorProductos === 'tabla' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                  onClick={() => cambiarVistaSelectorProductos('tabla')}
                  aria-pressed={vistaSelectorProductos === 'tabla'}
                >
                  📊 Tabla
                </button>
              </div>
              {productosFiltrados.length === 0 ? (
                <div className="empty-card ventas-selector-productos-empty">
                  <p>{busqProd.trim() ? 'No se encontraron productos' : 'No hay productos en inventario'}</p>
                </div>
              ) : vistaSelectorProductos === 'tabla' ? (
                <TablaScrollSuperior
                  ariaLabel="Productos en tabla"
                  classNameWrap="orden-resultados-tabla-wrap cuentas-cliente-tabla-wrap ventas-selector-productos-tabla-wrap"
                  syncDeps={[vistaSelectorProductos, productosFiltrados, busqProd]}
                >
                  <table className="cuentas-cliente-tabla orden-resultados-tabla ventas-selector-productos-tabla">
                    <thead>
                      <tr>
                        <th className="ventas-selector-productos-col-emoji" aria-hidden="true">
                          ·
                        </th>
                        <th>Serie</th>
                        <th>Descripción</th>
                        <th>Existencia</th>
                        <th>P. venta</th>
                        <th aria-label="Seleccionar producto">Elegir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosFiltrados.map((p) => (
                        <tr
                          key={p.id}
                          className="orden-resultados-fila orden-resultados-fila--clic ventas-selector-productos-fila"
                          role="button"
                          tabIndex={0}
                          title={`Seleccionar ${p.serie || 'producto'}`}
                          onClick={() => seleccionarProducto(p)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              seleccionarProducto(p)
                            }
                          }}
                        >
                          <td className="ventas-selector-productos-col-emoji">
                            <span className="inventario-producto-emoji inline" aria-hidden="true">
                              {emojiParaProducto(p, readIconosMap())}
                            </span>
                          </td>
                          <td className="orden-resultados-serie">
                            <strong>{p.serie || '—'}</strong>
                          </td>
                          <td className="ventas-selector-productos-col-desc">{p.descripcion || '—'}</td>
                          <td className="ventas-selector-productos-col-stock">{etiquetaExistencia(p)}</td>
                          <td className="inventarios-lista-col-precio">${Number(p.precio_venta ?? 0).toFixed(2)}</td>
                          <td className="cuentas-cliente-tabla-acciones">
                            <button
                              type="button"
                              className="cuentas-cliente-btn-abrir"
                              onClick={(e) => {
                                e.stopPropagation()
                                seleccionarProducto(p)
                              }}
                            >
                              Elegir →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TablaScrollSuperior>
              ) : (
                <ul className="orden-resultados-list ventas-selector-productos-lista">
                  {productosFiltrados.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="orden-resultado-card" onClick={() => seleccionarProducto(p)}>
                        <span className="inventario-producto-emoji inline" aria-hidden="true">
                          {emojiParaProducto(p, readIconosMap())}
                        </span>
                        <strong>{p.serie}</strong>
                        <span className="muted small">{p.descripcion}</span>
                        <span className="muted small">Existencia: {etiquetaExistencia(p)}</span>
                        <span className="muted small">${Number(p.precio_venta ?? 0).toFixed(2)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalProductos(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarCamposProducto ? (
        <div
          className="modal-backdrop ventas-producto-modal-backdrop"
          role="presentation"
          onClick={cerrarCapturaProducto}
        >
          <div
            className="modal ventas-producto-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ventas-producto-modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <section className="ventas-producto-panel ventas-producto-panel--flotante">
              <header className="ventas-producto-panel-header">
                <span className="ventas-producto-panel-ico" aria-hidden="true">
                  {productoCatalogoSel
                    ? emojiParaProducto(productoCatalogoSel, readIconosMap())
                    : productoContableSel
                      ? '📦'
                      : '🛠️'}
                </span>
                <div>
                  <h3 id="ventas-producto-modal-titulo" className="ventas-producto-panel-titulo">
                    {productoContableSel ? 'Agregar producto' : 'Agregar servicio'}
                  </h3>
                  <p className="ventas-producto-panel-sub">
                    Complete cantidad y precio. Al confirmar se agrega a la cuenta y cierra esta ventana.
                  </p>
                </div>
                <button
                  type="button"
                  className="ventas-producto-modal-cerrar"
                  onClick={cerrarCapturaProducto}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </header>

              <div className="ventas-producto-modal-body">
                <div className="ventas-producto-recuadro ventas-producto-recuadro--articulo">
                  <h4 className="ventas-producto-recuadro-titulo">Datos del artículo</h4>
                  <div className="ventas-producto-campos ventas-producto-campos--articulo">
                    <label className="ventas-producto-campo">
                      <span className="ventas-producto-campo-etiqueta">Serie</span>
                      <input
                        value={serieProd}
                        onChange={(e) => {
                          const serie = e.target.value.toUpperCase()
                          setSerieProd(serie)
                          const esC = esProductoContable({
                            serie,
                            descripcion: descProd,
                            contable: productoContableSel,
                          })
                          setProductoContableSel(esC)
                          setExistencia(
                            esC
                              ? String(
                                  todosProductos.find((x) => sameId(x.id, productoIdSel))?.existencia ??
                                    existencia,
                                )
                              : etiquetaExistencia({ serie, descripcion: descProd }),
                          )
                        }}
                      />
                    </label>
                    <label className="ventas-producto-campo ventas-producto-campo--ancho">
                      <span className="ventas-producto-campo-etiqueta">Descripción</span>
                      <input
                        value={descProd}
                        onChange={(e) => {
                          const descripcion = e.target.value.toUpperCase()
                          setDescProd(descripcion)
                          const esC = esProductoContable({
                            serie: serieProd,
                            descripcion,
                            contable: productoContableSel,
                          })
                          setProductoContableSel(esC)
                          setExistencia(
                            esC
                              ? String(
                                  todosProductos.find((x) => sameId(x.id, productoIdSel))?.existencia ??
                                    existencia,
                                )
                              : etiquetaExistencia({ serie: serieProd, descripcion }),
                          )
                        }}
                      />
                    </label>
                    <label className="ventas-producto-campo">
                      <span className="ventas-producto-campo-etiqueta">
                        {productoContableSel ? 'Existencia' : 'Stock'}
                      </span>
                      <input
                        className="ventas-producto-input--solo-lectura"
                        value={existencia}
                        onChange={(e) => setExistencia(e.target.value)}
                        readOnly
                      />
                    </label>
                  </div>
                  {!productoContableSel ? (
                    <p className="ventas-servicio-aviso">
                      <span aria-hidden="true">ℹ️</span> Servicio: no requiere existencia en inventario.
                    </p>
                  ) : null}
                </div>

                <div className="ventas-producto-recuadro ventas-producto-recuadro--venta">
                  <h4 className="ventas-producto-recuadro-titulo">Cantidad y precio</h4>
                  <div className="ventas-producto-campos ventas-producto-campos--venta">
                    <label className="ventas-producto-campo">
                      <span className="ventas-producto-campo-etiqueta">Cantidad</span>
                      <input
                        value={cantProd}
                        onChange={(e) => setCantProd(e.target.value)}
                        inputMode="decimal"
                        autoFocus
                      />
                    </label>
                    <label className="ventas-producto-campo">
                      <span className="ventas-producto-campo-etiqueta">Precio unitario</span>
                      <input
                        value={precioProd}
                        onChange={(e) => setPrecioProd(e.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="ventas-producto-campo ventas-producto-campo--subtotal">
                      <span className="ventas-producto-campo-etiqueta">Subtotal</span>
                      <input className="ventas-producto-input--solo-lectura" value={subtotalProdV} readOnly />
                    </label>
                  </div>
                </div>
              </div>

              <footer className="ventas-producto-panel-footer ventas-producto-panel-footer--flotante">
                <button type="button" className="secondary" onClick={cerrarCapturaProducto}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary-ventas" onClick={() => void agregarProductoLinea()}>
                  {productoContableSel ? '✅ Agregar a la cuenta' : '✅ Agregar servicio'}
                </button>
              </footer>
            </section>
          </div>
        </div>
      ) : null}

      <ModalAlerta
        open={modalNotificarCliente}
        onClose={() => setModalNotificarCliente(false)}
        titulo="Notificar al cliente"
        variante="info"
        tituloId="modal-notificar-cliente-titulo"
        role="dialog"
        textoBoton="Cerrar"
        backdropClose
        footer={
          <>
            <button type="button" className="secondary" onClick={() => void copiarMensajeNotificacion()}>
              📋 Copiar mensaje
            </button>
            {cliente.telefono?.trim() ? (
              <button type="button" className="btn-notificar-wa" onClick={enviarNotificacionWhatsApp}>
                📲 Enviar por WhatsApp
              </button>
            ) : null}
            <button
              type="button"
              className="btn-confirmar-envio-notificacion"
              disabled={confirmandoEnvioNotificacion || ordenVinculadaId == null}
              title={
                ordenVinculadaId == null
                  ? 'No hay orden de servicio vinculada a esta cuenta'
                  : 'Registrar en la bitácora de la orden que se notificó al cliente'
              }
              onClick={() => void confirmarEnvioNotificacion()}
            >
              {confirmandoEnvioNotificacion ? 'Confirmando…' : '✅ Confirmar envío'}
            </button>
            <button type="button" className="modal-alerta-btn" onClick={() => setModalNotificarCliente(false)}>
              Cerrar
            </button>
          </>
        }
      >
        <p className="muted small">Puede editar el mensaje antes de copiarlo o enviarlo al cliente:</p>
        {errorNotificacion ? (
          <p className="error ventas-notificacion-error" role="alert">
            {errorNotificacion}
          </p>
        ) : null}
        {ordenVinculadaId == null ? (
          <p className="warning small">
            No hay orden de servicio vinculada; no se podrá registrar en la bitácora.
          </p>
        ) : (
          <p className="muted small">
            Orden vinculada: <strong>#{ordenVinculadaId}</strong>
          </p>
        )}
        <textarea
          className="cuenta-notificacion-mensaje"
          rows={8}
          value={mensajeNotificacionEditado}
          onChange={(e) => setMensajeNotificacionEditado(e.target.value)}
          aria-label="Mensaje para el cliente"
        />
      </ModalAlerta>

      <ModalAlerta
        open={modalExitoNotificacion}
        onClose={() => setModalExitoNotificacion(false)}
        titulo="Nota agregada con éxito"
        variante="success"
        tituloId="modal-exito-notificacion-titulo"
        role="alertdialog"
        textoBoton="Entendido"
        backdropClose
        mensaje={detalleExitoNotificacion || 'Se registró la notificación en la bitácora de la orden.'}
      />
    </div>
  )
}
