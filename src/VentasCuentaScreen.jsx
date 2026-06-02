import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
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
  marcarReparacionEntregadaSupabase,
  patchReparacionEntregada,
  formatFechaLegibleEsMx,
  aplicarCuentaPagadaActiva,
  sincronizarEstatusCuentaPorSaldo,
  sumPagosCuenta,
} from './reparacionUtils.js'

const LS_CUENTAS = 'sistefix_local_cuentas'
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
  return {
    key: `pago_${p.id}`,
    tipo: 'pago',
    dbId: p.id,
    producto_id: -1,
    cantidad: -1,
    descripcion: `PAGO: ${p.concepto ?? 'Pago'} (${p.forma_pago ?? 'EFECTIVO'})`,
    precioUnitario: monto,
    subtotal: -monto,
    fechaPago: etiquetaFechaPago(p),
  }
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
  puedeEliminar = true,
}) {
  const { alertaPermiso, intentarEliminar } = usePermisoEliminar(puedeEliminar)
  const cliente = useMemo(() => normalizeClienteRow(context?.cliente ?? {}), [context?.cliente])
  const cuentaInicial = context?.cuenta

  const [loading, setLoading] = useState(true)
  const [cuentaInfo, setCuentaInfo] = useState(null)
  const [reparaIdCuenta, setReparaIdCuenta] = useState(null)
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
  const [pagandoAdeudoTotal, setPagandoAdeudoTotal] = useState(false)
  const pagandoAdeudoRef = useRef(false)
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
  const saldoPendiente = useMemo(() => Math.max(0, balanceNeto), [balanceNeto])
  const totalStr = totalCargos.toFixed(2)
  const saldoStr = saldoPendiente.toFixed(2)
  const saldoAFavor = balanceNeto < -0.0001
  const puedePagarAdeudoTotal = esCuentaExistente && saldoPendiente > 0.0001
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
        const rid = ridRaw != null && ridRaw !== '' ? ridRaw : null
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
        if (rid != null) {
          if (supabase) {
            const [r2, rRep] = await Promise.all([
              supabase.from('reparamov').select('*').eq('repara_id', rid),
              supabase
                .from('reparaciones')
                .select('id, costo_reparacion, descripcion_equipo')
                .eq('id', rid)
                .maybeSingle(),
            ])
            if (!r2.error) reps = r2.data ?? []
            if (!rRep.error) repOrden = rRep.data
          } else {
            reps = readLs(LS_REPARAMOV, []).filter((x) => sameId(x.repara_id, rid))
            repOrden = readLs(LS_REP, []).find((x) => sameId(x.id, rid)) ?? null
          }
        }

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
    const rb = cuentaInicial?.repara_id
    if (cid != null) {
      void cargarTodo(cid, rb)
    } else {
      setCuentaInfo(null)
      const rbNorm = rb != null && rb !== '' ? rb : null
      setReparaIdCuenta(rbNorm)
      setLineas([])
      setLoading(false)
    }
  }, [cuentaInicial?.id, cuentaInicial?.repara_id, cargarTodo])
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
  }, [supabase, cuentaId, totalCargos, lineas, cuentaInfo, cuentaInicial, onError, recargarCuentaInfoDesdeServidor])

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
    const cargos = totalCargosDesdeLineas(lineasUi)
    if (cargos <= 0.0001) return false
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
        ? 'Cuenta liquidada. La orden sigue activa hasta marcarla entregada en servicio.'
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
    if (!confirm('¿Eliminar este elemento de la lista?')) return
    try {
      if (L.tipo === 'reparamov' && L.dbId != null) {
        if (supabase) {
          const { error } = await supabase.from('reparamov').delete().eq('id', L.dbId)
          if (error) throw error
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
          const { error } = await supabase.from('cuentamov').delete().eq('id', L.dbId)
          if (error) throw error
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
          const { error } = await supabase.from('pagosclientes').delete().eq('id', L.dbId)
          if (error) throw error
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
    const saldoNet =
      totalOverride != null ? Number(totalOverride) : calcularSaldoPendiente(lineas, totalCargos)
    if (saldoNet > 0.0001) {
      if (avisar) {
        onError?.(`No se puede liquidar: aún hay saldo pendiente de $${saldoNet.toFixed(2)}.`)
      }
      return false
    }
    const cargos = totalCargosDesdeLineas(lineas)
    const pagosUi = sumMontoPagos(pagosDesdeLineas(lineas))
    if (cargos > 0.01 && pagosUi < cargos - 0.01) {
      if (avisar) {
        onError?.(
          `Registre el pago antes de liquidar: cargos $${cargos.toFixed(2)}, pagos registrados $${pagosUi.toFixed(2)}.`,
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
    const totalCuenta = Math.max(totalCargosDesdeLineas(lineas), Number(cuentaInfo?.total ?? 0))
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
      if (reparaIdCuenta != null) {
        await marcarReparacionEntregadaSupabase(supabase, reparaIdCuenta)
      }
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
      if (reparaIdCuenta != null) {
        const lr = readLs(LS_REP, [])
        const patchEnt = patchReparacionEntregada()
        writeLs(
          LS_REP,
          lr.map((r) => (sameId(r.id, reparaIdCuenta) ? { ...r, ...patchEnt } : r)),
        )
      }
      estatusElegidoManualRef.current = 'LIQUIDADA'
      setCuentaInfo((prev) => ({ ...(prev ?? { id: cuentaId }), ...patchLiq }))
    }
    return true
  }

  async function liquidarCuenta() {
    try {
      const ok = await aplicarLiquidacionCuenta({ avisar: true })
      if (ok) onNotice?.('Cuenta liquidada')
    } catch (e) {
      onError?.(`Error al liquidar: ${e.message}`)
    }
  }

  function enviarComprobante() {
    if (!cliente.telefono?.trim()) {
      onError?.('El teléfono del cliente es requerido para el comprobante')
      return
    }
    const rows = lineas
      .map(
        (L) =>
          `<tr><td>${L.tipo === 'pago' ? -Number(L.cantidad) : Number(L.cantidad)}</td><td>${escapeHtml(L.descripcion)}</td><td>${escapeHtml(L.tipo === 'pago' ? L.fechaPago ?? '—' : '—')}</td><td>$${Number(L.precioUnitario).toFixed(2)}</td><td>$${Number(L.subtotal).toFixed(2)}</td></tr>`,
      )
      .join('')
    const html = `<h1>Comprobante</h1><p><strong>Cliente:</strong> ${escapeHtml(cliente.nombre)} — ${escapeHtml(cliente.telefono)}</p><p><strong>Total:</strong> $${totalStr} — <strong>Estatus:</strong> ${escapeHtml(cuentaEstatus || '—')}</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><thead><tr><th>Cant</th><th>Descripción</th><th>Fecha</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table>`
    const w = window.open('', '_blank')
    if (!w) {
      onError?.('Permita ventanas emergentes para imprimir.')
      return
    }
    w.document.write(
      `<!DOCTYPE html><html><head><title>Comprobante</title><style>body{font-family:Arial;padding:16px}</style></head><body>${html}<p>Imprima o guarde como PDF y compártalo por WhatsApp.</p></body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
                Crear cuenta
              </button>
            </div>
          )}
        </section>

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
          Agregar Producto/Servicio
        </button>

        <div className="ventas-cuenta-resumen" role="group" aria-label="Total y saldo de la cuenta">
          <div
            className={`ventas-cuenta-recuadro ventas-cuenta-recuadro--total${saldoAFavor ? ' ventas-cuenta-recuadro--saldo-favor' : ''}`}
          >
            <span className="ventas-cuenta-recuadro-etiqueta">{saldoAFavor ? 'Total (a favor)' : 'Total'}</span>
            <span className="ventas-cuenta-recuadro-monto">${totalStr}</span>
          </div>
          <div
            className={`ventas-cuenta-recuadro ventas-cuenta-recuadro--saldo${saldoPendiente > 0.0001 ? ' ventas-cuenta-recuadro--saldo-pend' : ''}`}
          >
            <span className="ventas-cuenta-recuadro-etiqueta">Saldo</span>
            <span className="ventas-cuenta-recuadro-monto">${saldoStr}</span>
          </div>
        </div>

        <label className="ventas-total-block">
          <span>Estatus de la Cuenta</span>
          <input value={cuentaEstatus || '—'} readOnly className="readonly-field" />
        </label>

        <div className="ventas-acciones">
          {esCuentaExistente && cuentaEstatus.toUpperCase() !== 'LIQUIDADA' ? (
            <button type="button" className="btn-liquidar-cuenta" onClick={() => void liquidarCuenta()}>
              ✅ LIQUIDAR CUENTA
            </button>
          ) : null}
          <button type="button" className="btn-comprobante-ventas" onClick={enviarComprobante}>
            📧 ENVIAR COMPROBANTE
          </button>
          <button type="button" className="btn-salir-ventas" onClick={onSalir}>
            ❌ SALIR
          </button>
        </div>
      </div>

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
          <div className="modal modal-confirmar-datos" role="dialog" onClick={(e) => e.stopPropagation()}>
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
                  <strong>Liquidar cuenta:</strong> cierra la cuenta en el sistema.
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
                Activa pagada
              </button>
              <button type="button" className="btn-liquidar-cuenta" onClick={() => void elegirLiquidarCuentaTrasPago()}>
                Liquidar cuenta
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
    </div>
  )
}
