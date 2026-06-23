/* eslint-disable react-hooks/set-state-in-effect -- efecto de carga inicial de clientes (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import ConfirmarDatosModal from './ConfirmarDatosModal.jsx'
import { buscarClientesSimilares } from './duplicadosUtils.js'
import { cargarTodosPagosClientes } from './pagosClientesUtils.js'
import {
  aYmdLocalDesdeRaw,
  isReparacionActiva,
  sincronizarEstatusCuentaPorSaldo,
  eliminarCuentaCompleta,
} from './reparacionUtils.js'
import ClientesCuentasVentasPanel from './ClientesCuentasVentasPanel.jsx'
import ClientesOrdenesServicioPanel from './ClientesOrdenesServicioPanel.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import AlertaPermiso from './AlertaPermiso.jsx'
import { usePermisoEliminar } from './usePermisoEliminar.js'

const LS_CLIENTES = 'sistefix_local_clientes'
const LS_VISTA_CLIENTES = 'sistefix_clientes_lista_vista'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_REP = 'sistefix_local_reparaciones'
const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_PAGOS = 'sistefix_local_pagosclientes'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'

function sumCargosCuentamov(movs = []) {
  return movs.reduce((s, m) => s + Number(m.cantidad ?? 0) * Number(m.costo ?? 0), 0)
}

function totalVentaCuenta(cuenta, movs = []) {
  const cargos = sumCargosCuentamov(movs)
  const ct = Number(cuenta?.total ?? 0)
  return Math.max(ct, cargos)
}

function nextLocalClienteId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
}

function nextLocalCuentaId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
}

function cuentaParaVentas(cuenta) {
  if (!cuenta?.id) return undefined
  return {
    id: cuenta.id,
    total: cuenta.total,
    saldo: cuenta.saldo,
    estatus: cuenta.estatus,
    repara_id: cuenta.repara_id ?? null,
  }
}

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function writeLs(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

function leerVistaClientes() {
  try {
    return localStorage.getItem(LS_VISTA_CLIENTES) === 'tabla' ? 'tabla' : 'tarjetas'
  } catch {
    return 'tarjetas'
  }
}

/**
 * Módulo Clientes alineado con ClientesScreen.kt (lista, búsqueda, acciones Servicio/Cuentas, órdenes de servicio, ventas).
 */
export default function ClientesModulo({
  supabase,
  onHome,
  onOpenServiciosConCliente,
  onOpenReparaciones,
  onOpenVentas,
  onIrEquipos,
  onIrAOrdenServicio,
  onError,
  onNotice,
  retornoVentas = null,
  onRetornoVentasConsumido,
  retornoOrdenes = null,
  onRetornoOrdenesConsumido,
  puedeEliminar = false,
}) {
  const { alertaPermiso, intentarEliminar, mostrarSinPermiso } = usePermisoEliminar(puedeEliminar)
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [textoBusqueda, setTextoBusqueda] = useState('')

  const [dialogoCliente, setDialogoCliente] = useState(false)
  const [modalConfirmGuardarCliente, setModalConfirmGuardarCliente] = useState(false)
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const [coincidenciasCliente, setCoincidenciasCliente] = useState([])
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [domicilio, setDomicilio] = useState('')
  const [correo, setCorreo] = useState('')
  const [clienteEditando, setClienteEditando] = useState(null)

  const [modalAcciones, setModalAcciones] = useState(false)
  const [clienteAccion, setClienteAccion] = useState(null)

  const [modalCuentasVentas, setModalCuentasVentas] = useState(false)
  const [cuentasEncontradas, setCuentasEncontradas] = useState([])
  const [pagosClienteCuentas, setPagosClienteCuentas] = useState([])
  const [loadingCuentas, setLoadingCuentas] = useState(false)
  const [cuentaTitle, setCuentaTitle] = useState('Cuentas / Ventas')
  const [cuentaSubtitle, setCuentaSubtitle] = useState('')
  /** Resumen del modal de cuentas (totales por cliente). null si error o aún no cargado. */
  const [cuentaResumen, setCuentaResumen] = useState(null)

  const [modalRepActivas, setModalRepActivas] = useState(false)
  const [repsActivas, setRepsActivas] = useState([])
  const [loadingReps, setLoadingReps] = useState(false)
  const [repTitle, setRepTitle] = useState('Órdenes de servicio')
  const [repSubtitle, setRepSubtitle] = useState('')
  /** Resumen del modal de órdenes (totales por cliente). null si error o aún no cargado. */
  const [repResumen, setRepResumen] = useState(null)
  const [equiposPorIdOrdenes, setEquiposPorIdOrdenes] = useState({})
  const [cuentasPorReparaOrdenes, setCuentasPorReparaOrdenes] = useState({})
  const [ymdPagoPorCuentaOrdenes, setYmdPagoPorCuentaOrdenes] = useState({})

  const [cargandoEquipoRep, setCargandoEquipoRep] = useState(false)
  const [vistaLista, setVistaLista] = useState(leerVistaClientes)

  function cambiarVistaLista(modo) {
    setVistaLista(modo)
    try {
      localStorage.setItem(LS_VISTA_CLIENTES, modo)
    } catch {
      /* ignore */
    }
  }

  const clientesFiltrados = useMemo(() => {
    const t = textoBusqueda.trim().toLowerCase()
    if (!t) return clientes
    return clientes.filter((c) => {
      const n = String(c.nombre ?? '').toLowerCase()
      const tel = String(c.telefono ?? '').toLowerCase()
      const dom = String(c.domicilio ?? '').toLowerCase()
      const mail = String(c.correo ?? '').toLowerCase()
      return n.includes(t) || tel.includes(t) || dom.includes(t) || mail.includes(t)
    })
  }, [clientes, textoBusqueda])

  const cargarClientes = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false })
        if (error) throw error
        setClientes((data ?? []).map((r) => normalizeClienteRow(r)))
      } else {
        setClientes(readLs(LS_CLIENTES, []).map((r) => normalizeClienteRow(r)))
      }
    } catch (e) {
      onError?.(`Error al cargar clientes: ${e.message}`)
      setClientes([])
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarClientes()
  }, [cargarClientes])

  function abrirAgregar() {
    setNombre('')
    setTelefono('')
    setDomicilio('')
    setCorreo('')
    setClienteEditando(null)
    setCoincidenciasCliente([])
    setDialogoCliente(true)
  }

  function abrirEditar(c) {
    const row = normalizeClienteRow(c)
    setNombre(row.nombre)
    setTelefono(row.telefono)
    setDomicilio(row.domicilio)
    setCorreo(row.correo)
    setClienteEditando(row)
    setCoincidenciasCliente([])
    setDialogoCliente(true)
  }

  function solicitarGuardarCliente() {
    if (!nombre.trim()) {
      onError?.('El nombre es requerido')
      return
    }
    if (!telefono.trim()) {
      onError?.('El teléfono es requerido')
      return
    }
    const similares = buscarClientesSimilares(clientes, {
      nombre: nombre,
      telefono: telefono,
      excludeId: clienteEditando?.id ?? null,
    })
    setCoincidenciasCliente(similares.slice(0, 4))
    setModalConfirmGuardarCliente(true)
  }

  async function ejecutarGuardarCliente() {
    const row = {
      nombre: nombre.trim().toUpperCase(),
      telefono: telefono.trim(),
      domicilio: domicilio.trim().toUpperCase(),
      correo: correo.trim().toLowerCase(),
    }
    setGuardandoCliente(true)
    try {
      if (supabase) {
        if (clienteEditando?.id != null) {
          const { error } = await supabase.from('clientes').update(row).eq('id', clienteEditando.id)
          if (error) throw error
          onNotice?.('Cliente actualizado')
        } else {
          const { error } = await supabase.from('clientes').insert(row)
          if (error) throw error
          onNotice?.('Cliente agregado')
        }
      } else {
        const list = readLs(LS_CLIENTES, [])
        if (clienteEditando?.id != null) {
          writeLs(
            LS_CLIENTES,
            list.map((item) => (sameId(item.id, clienteEditando.id) ? { ...item, ...row } : item)),
          )
          onNotice?.('Cliente actualizado')
        } else {
          const nuevo = { id: nextLocalClienteId(list), ...row }
          writeLs(LS_CLIENTES, [nuevo, ...list])
          onNotice?.('Cliente agregado')
        }
      }
      setModalConfirmGuardarCliente(false)
      setCoincidenciasCliente([])
      setDialogoCliente(false)
      setClienteEditando(null)
      await cargarClientes()
    } catch (e) {
      onError?.(`Error al guardar cliente: ${e.message}`)
    } finally {
      setGuardandoCliente(false)
    }
  }

  function abrirAcciones(c) {
    setClienteAccion(normalizeClienteRow(c))
    setModalAcciones(true)
  }

  const cargarCuentasVentasModal = useCallback(
    async (cliente, { cerrarModalAcciones = false } = {}) => {
      if (!cliente?.id) {
        onError?.('Cliente sin ID válido')
        return
      }
      const cli = normalizeClienteRow(cliente)
      setClienteAccion(cli)
      if (cerrarModalAcciones) setModalAcciones(false)
      setLoadingCuentas(true)
      setCuentasEncontradas([])
      setPagosClienteCuentas([])
      setCuentaTitle('Cuentas / Ventas')
      setCuentaSubtitle('')
      setCuentaResumen(null)
      try {
        let todasCuentas = []
        if (supabase) {
          const { data, error } = await supabase
            .from('cuentas')
            .select('*')
            .eq('cliente_id', cli.id)
            .order('id', { ascending: false })
          if (error) throw error
          todasCuentas = data ?? []
        } else {
          todasCuentas = readLs(LS_CUENTAS, []).filter((cu) => sameId(cu.cliente_id, cli.id))
        }
        const cuentasCliente = supabase
          ? todasCuentas
          : todasCuentas.filter((cu) => sameId(cu.cliente_id, cli.id))
        let pagosTodos = []
        const movsPorCuenta = new Map()
        if (supabase) {
          const idsCuentaArr = cuentasCliente.map((c) => c.id).filter((id) => id != null)
          const [pagRes, movRes] = await Promise.all([
            cargarTodosPagosClientes(supabase),
            idsCuentaArr.length
              ? supabase.from('cuentamov').select('*').in('cuenta_id', idsCuentaArr)
              : Promise.resolve({ data: [], error: null }),
          ])
          pagosTodos = pagRes ?? []
          if (movRes.error) throw movRes.error
          for (const m of movRes.data ?? []) {
            const k = String(m.cuenta_id)
            if (!movsPorCuenta.has(k)) movsPorCuenta.set(k, [])
            movsPorCuenta.get(k).push(m)
          }
        } else {
          pagosTodos = readLs(LS_PAGOS, [])
          for (const m of readLs(LS_CUENTAMOV, [])) {
            const k = String(m.cuenta_id)
            if (!cuentasCliente.some((cu) => sameId(cu.id, m.cuenta_id))) continue
            if (!movsPorCuenta.has(k)) movsPorCuenta.set(k, [])
            movsPorCuenta.get(k).push(m)
          }
        }
        const idsCuenta = new Set(cuentasCliente.map((c) => String(c.id)))
        const pagosDelCliente = pagosTodos.filter((p) => idsCuenta.has(String(p?.cuenta_id)))
        let cuentasFinales = cuentasCliente
        if (supabase) {
          cuentasFinales = await Promise.all(
            cuentasCliente.map((cu) => {
              const est = String(cu.estatus ?? '').trim().toUpperCase()
              if (est === 'LIQUIDADA' || est === 'PAGADA') {
                const movs = movsPorCuenta.get(String(cu.id)) ?? []
                const totalVenta = totalVentaCuenta(cu, movs)
                return { ...cu, total: totalVenta, saldo: 0 }
              }
              const pagosC = pagosDelCliente.filter((p) => sameId(p.cuenta_id, cu.id))
              const movs = movsPorCuenta.get(String(cu.id)) ?? []
              const totalVenta = totalVentaCuenta(cu, movs)
              return sincronizarEstatusCuentaPorSaldo(supabase, cu, pagosC, { totalVenta })
            }),
          )
          const { data: refreshed, error: errRef } = await supabase
            .from('cuentas')
            .select('*')
            .eq('cliente_id', cli.id)
            .order('id', { ascending: false })
          if (!errRef && refreshed?.length) cuentasFinales = refreshed
        } else {
          cuentasFinales = cuentasCliente.map((cu) => {
            const pagosC = pagosDelCliente.filter((p) => sameId(p.cuenta_id, cu.id))
            const movs = movsPorCuenta.get(String(cu.id)) ?? []
            const total = totalVentaCuenta(cu, movs)
            const pagado = pagosC.reduce((s, p) => s + Number(p.pago ?? 0), 0)
            return { ...cu, total, saldo: Math.max(0, total - pagado) }
          })
        }
        setCuentasEncontradas(cuentasFinales)
        setPagosClienteCuentas(pagosDelCliente)
        const n = cuentasFinales.length
        const pendientes = cuentasFinales.filter(
          (c) => String(c.estatus ?? '').toUpperCase() !== 'LIQUIDADA',
        ).length
        setCuentaResumen({
          nombre: String(cli.nombre || 'Cliente').trim() || 'Cliente',
          total: n,
          pendientes,
          liquidadas: n - pendientes,
        })
        setModalCuentasVentas(true)
      } catch (e) {
        setCuentaTitle('Error de búsqueda')
        setCuentaResumen(null)
        setCuentaSubtitle(`Error: ${e.message}`)
        setCuentasEncontradas([])
        setPagosClienteCuentas([])
        setModalCuentasVentas(true)
      } finally {
        setLoadingCuentas(false)
      }
    },
    [supabase, onError],
  )

  useEffect(() => {
    const r = retornoVentas
    if (!r?.openAccionesModal || !r?.cliente?.id) return
    const cli = normalizeClienteRow(r.cliente)
    setClienteAccion(cli)
    if (r.reopenCuentasPanel) {
      setModalAcciones(false)
      void cargarCuentasVentasModal(cli)
    } else {
      setModalCuentasVentas(false)
      setModalAcciones(true)
    }
    onRetornoVentasConsumido?.()
  }, [retornoVentas, onRetornoVentasConsumido, cargarCuentasVentasModal])

  async function crearCuentaVaciaParaCliente(cli) {
    const row = {
      cliente_id: cli.id,
      total: 0,
      saldo: 0,
      estatus: 'PENDIENTE',
      tipo_pago: 'EFECTIVO',
      repara_id: null,
    }
    if (supabase) {
      const { data, error } = await supabase.from('cuentas').insert(row).select('*').single()
      if (error) throw error
      return data
    }
    const list = readLs(LS_CUENTAS, [])
    const nuevo = { id: nextLocalCuentaId(list), ...row, created_at: new Date().toISOString() }
    writeLs(LS_CUENTAS, [nuevo, ...list])
    return nuevo
  }

  async function abrirCuentasVentasCliente() {
    const cliente = clienteAccion
    if (!cliente?.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    await cargarCuentasVentasModal(cliente, { cerrarModalAcciones: true })
  }

  async function eliminarCuentaCliente(cuenta) {
    if (!puedeEliminar) {
      mostrarSinPermiso()
      return
    }
    const idCuenta = cuenta?.id
    if (idCuenta == null) return
    const ordenRef =
      cuenta.repara_id != null && cuenta.repara_id !== '' && String(cuenta.repara_id) !== String(idCuenta)
        ? String(cuenta.repara_id)
        : null
    const msgOrden = ordenRef
      ? `\n\nLa orden de servicio #${ordenRef} seguirá existiendo sin esta cuenta.`
      : ''
    if (
      !window.confirm(
        `¿Eliminar la cuenta #${idCuenta} de ${clienteAccion?.nombre || 'este cliente'}?\n\nSe borrarán pagos y movimientos asociados. Esta acción no se puede deshacer.${msgOrden}`,
      )
    ) {
      return
    }
    try {
      await eliminarCuentaCompleta(supabase, idCuenta)
      onNotice?.(`Cuenta #${idCuenta} eliminada`)
      if (clienteAccion?.id) {
        await cargarCuentasVentasModal(clienteAccion)
      }
    } catch (e) {
      onError?.(`Error al eliminar cuenta: ${e.message}`)
    }
  }

  function handleEliminarCuenta(cuenta) {
    intentarEliminar(() => void eliminarCuentaCliente(cuenta))
  }

  function seleccionarCuentaVentas(cuenta) {
    const cliente = clienteAccion
    if (!cliente) return
    setModalCuentasVentas(false)
    onOpenVentas?.({
      cliente: normalizeClienteRow(cliente),
      cuenta: cuentaParaVentas(cuenta),
    })
  }

  async function nuevaCuentaVentasCliente() {
    const cliente = clienteAccion
    if (!cliente?.id) return
    const cli = normalizeClienteRow(cliente)
    try {
      const nueva = await crearCuentaVaciaParaCliente(cli)
      setModalCuentasVentas(false)
      onOpenVentas?.({ cliente: cli, cuenta: cuentaParaVentas(nueva) })
      onNotice?.('Cuenta nueva lista para venta')
    } catch (e) {
      onError?.(`Error al crear cuenta: ${e.message}`)
    }
  }

  function cerrarModalCuentasVentas() {
    setModalCuentasVentas(false)
    if (clienteAccion?.id != null) {
      setModalAcciones(true)
    }
  }

  const cargarOrdenesParaCliente = useCallback(
    async (cliente, { cerrarModalAcciones = false } = {}) => {
      const cli = normalizeClienteRow(cliente)
      if (!cli?.id) {
        onError?.('Cliente sin ID válido')
        return
      }
      setClienteAccion(cli)
      if (cerrarModalAcciones) setModalAcciones(false)
      setLoadingReps(true)
      setRepTitle('Órdenes de servicio')
      setRepResumen(null)
      setRepSubtitle('')
      try {
        let todas = []
        if (supabase) {
          const { data, error } = await supabase.from('reparaciones').select('*').order('id', { ascending: false })
          if (error) throw error
          todas = data ?? []
        } else {
          todas = readLs(LS_REP, [])
        }
        const delCliente = todas.filter((r) => sameId(r.cliente_id, cli.id))
        delCliente.sort((a, b) => {
          const aa = isReparacionActiva(a) ? 0 : 1
          const bb = isReparacionActiva(b) ? 0 : 1
          if (aa !== bb) return aa - bb
          const ida = Number(a.id) || 0
          const idb = Number(b.id) || 0
          return idb - ida
        })
        setRepsActivas(delCliente)

        const eqMap = {}
        let todasCuentas = []
        let todosPagos = []
        if (supabase) {
          const [eqRes, cuRes, pagRes] = await Promise.all([
            supabase.from('equipos').select('*'),
            supabase.from('cuentas').select('*'),
            supabase.from('pagosclientes').select('*'),
          ])
          if (!eqRes.error) {
            for (const e of eqRes.data ?? []) {
              if (e?.id != null) eqMap[String(e.id)] = e
            }
          }
          if (!cuRes.error) todasCuentas = cuRes.data ?? []
          if (!pagRes.error) todosPagos = pagRes.data ?? []
        } else {
          for (const e of readLs(LS_EQUIPOS, [])) {
            if (e?.id != null) eqMap[String(e.id)] = e
          }
          todasCuentas = readLs(LS_CUENTAS, [])
          todosPagos = readLs(LS_PAGOS, [])
        }
        const idsRep = new Set(delCliente.map((r) => String(r.id)))
        const cuentaMap = {}
        const idsCuenta = new Set()
        for (const c of todasCuentas) {
          const rid = c?.repara_id ?? c?.reparacion_id
          if (rid == null || !idsRep.has(String(rid))) continue
          cuentaMap[String(rid)] = c
          if (c.id != null) idsCuenta.add(String(c.id))
        }
        const ymdPorCuenta = {}
        for (const p of todosPagos) {
          const cid = p?.cuenta_id
          if (cid == null || !idsCuenta.has(String(cid))) continue
          const y = aYmdLocalDesdeRaw(p?.created_at ?? p?.fecha ?? p?.fecha_pago)
          if (!y) continue
          const key = String(cid)
          const prev = ymdPorCuenta[key]
          if (!prev || y > prev) ymdPorCuenta[key] = y
        }
        setEquiposPorIdOrdenes(eqMap)
        setCuentasPorReparaOrdenes(cuentaMap)
        setYmdPagoPorCuentaOrdenes(ymdPorCuenta)

        const n = delCliente.length
        const nAct = delCliente.filter(isReparacionActiva).length
        const nEnt = n - nAct
        setRepResumen({
          nombre: String(cli.nombre || 'Cliente').trim() || 'Cliente',
          total: n,
          enTaller: nAct,
          entregadas: nEnt,
        })
        setModalRepActivas(true)
      } catch (e) {
        setRepTitle('Error de búsqueda')
        setRepResumen(null)
        setRepSubtitle(`Error: ${e.message}`)
        setRepsActivas([])
        setEquiposPorIdOrdenes({})
        setCuentasPorReparaOrdenes({})
        setYmdPagoPorCuentaOrdenes({})
        setModalRepActivas(true)
      } finally {
        setLoadingReps(false)
      }
    },
    [supabase, onError],
  )

  useEffect(() => {
    const r = retornoOrdenes
    if (!r?.openOrdenesModal || !r?.cliente?.id) return
    void cargarOrdenesParaCliente(r.cliente)
    onRetornoOrdenesConsumido?.()
  }, [retornoOrdenes, onRetornoOrdenesConsumido, cargarOrdenesParaCliente])

  async function buscarOrdenesServicioCliente() {
    const cliente = clienteAccion
    if (!cliente?.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    await cargarOrdenesParaCliente(cliente, { cerrarModalAcciones: true })
  }

  async function fetchEquipoPorId(equipoId) {
    if (equipoId == null) return { serie: '', tipo: '' }
    if (supabase) {
      const { data } = await supabase.from('equipos').select('*').eq('id', equipoId).maybeSingle()
      return { serie: data?.serie ?? '', tipo: data?.tipo_equipo ?? '' }
    }
    const list = readLs(LS_EQUIPOS, [])
    const eq = list.find((e) => sameId(e.id, equipoId))
    return { serie: eq?.serie ?? '', tipo: eq?.tipo_equipo ?? '' }
  }

  async function seleccionarOrdenCliente(rep) {
    const cliente = clienteAccion
    if (!cliente || !rep) return
    setCargandoEquipoRep(true)
    setModalRepActivas(false)
    try {
      const { serie: serieEquipo, tipo: tipoEquipo } = await fetchEquipoPorId(rep.equipo_id)
      onOpenReparaciones({
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        clienteDomicilio: cliente.domicilio,
        clienteCorreo: cliente.correo,
        equipoId: rep.equipo_id ?? null,
        equipoSerie: serieEquipo,
        equipoTipo: tipoEquipo,
        equipoDescripcion: '',
        equipoTipoReparacion: rep.tipo_reparacion ?? '',
        reparacionId: rep.id != null ? String(rep.id) : '',
        returnToClientesOrdenes: cliente,
      })
    } catch (e) {
      onError?.(`Error al cargar información del equipo: ${e.message}`)
    } finally {
      setCargandoEquipoRep(false)
    }
  }

  function nuevaReparacionIrServicios() {
    const cliente = clienteAccion
    setModalRepActivas(false)
    if (cliente?.id != null) {
      onOpenServiciosConCliente?.(cliente)
    }
  }

  function handleAtras() {
    if (modalCuentasVentas) {
      setModalCuentasVentas(false)
      if (clienteAccion?.id != null) {
        setModalAcciones(true)
      }
      return
    }
    if (modalRepActivas) {
      setModalRepActivas(false)
      if (clienteAccion?.id != null) {
        setModalAcciones(true)
      }
      return
    }
    if (modalAcciones) {
      setModalAcciones(false)
      setClienteAccion(null)
      return
    }
    if (dialogoCliente) {
      setDialogoCliente(false)
      return
    }
    onHome?.()
  }

  return (
    <div className={`servicios-root clientes-modulo${vistaLista === 'tabla' ? ' clientes-modulo--tabla' : ''}`}>
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={handleAtras} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">👥</span>
          Clientes
        </h1>
        {onHome ? (
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
            Inicio
          </button>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <AlertaPermiso mensaje={alertaPermiso} />

      <div className="servicios-body">
        <button type="button" className="btn-agregar-equipo" onClick={abrirAgregar}>
          + AGREGAR CLIENTE
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar por nombre, teléfono, domicilio o correo..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : clientesFiltrados.length === 0 ? (
          <div className="empty-card">
            <p>{textoBusqueda.trim() ? 'No se encontraron resultados' : 'No hay clientes registrados'}</p>
          </div>
        ) : (
          <>
            <div className="cuentas-cliente-vista-bar clientes-lista-vista-bar" role="group" aria-label="Forma de ver los clientes">
              <button
                type="button"
                className={`cuentas-cliente-vista-btn${vistaLista === 'tarjetas' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                onClick={() => cambiarVistaLista('tarjetas')}
                aria-pressed={vistaLista === 'tarjetas'}
              >
                🗂️ Tarjetas
              </button>
              <button
                type="button"
                className={`cuentas-cliente-vista-btn${vistaLista === 'tabla' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                onClick={() => cambiarVistaLista('tabla')}
                aria-pressed={vistaLista === 'tabla'}
              >
                📊 Tabla
              </button>
            </div>

            {vistaLista === 'tabla' ? (
              <TablaScrollSuperior
                ariaLabel="Lista de clientes en tabla"
                classNameWrap="cuentas-cliente-tabla-wrap clientes-lista-tabla-wrap"
                syncDeps={[vistaLista, clientesFiltrados, loading]}
              >
                <table className="cuentas-cliente-tabla clientes-lista-tabla">
                  <thead>
                    <tr>
                      <th className="clientes-lista-col-editar" aria-label="Editar">
                        ✏️
                      </th>
                      <th>Nombre</th>
                      <th>Teléfono</th>
                      <th>Domicilio</th>
                      <th>Correo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFiltrados.map((c) => {
                      const row = normalizeClienteRow(c)
                      return (
                        <tr
                          key={row.id ?? row.nombre}
                          className="clientes-lista-tabla-fila clientes-lista-tabla-fila--clic"
                          role="button"
                          tabIndex={0}
                          title={`Abrir ${row.nombre || 'cliente'}`}
                          onClick={() => abrirAcciones(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              abrirAcciones(row)
                            }
                          }}
                        >
                          <td className="cuentas-cliente-tabla-acciones clientes-lista-tabla-acciones clientes-lista-col-editar">
                            <button
                              type="button"
                              className="btn-icon edit clientes-lista-btn-icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                abrirEditar(row)
                              }}
                              title="Editar cliente"
                              aria-label="Editar cliente"
                            >
                              ✏️
                            </button>
                          </td>
                          <td className="clientes-lista-col-nombre">
                            <strong>{row.nombre || 'Sin nombre'}</strong>
                          </td>
                          <td className="clientes-lista-col-tel">{row.telefono || '—'}</td>
                          <td className="clientes-ordenes-col-texto">{row.domicilio || '—'}</td>
                          <td className="clientes-ordenes-col-texto">{row.correo || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TablaScrollSuperior>
            ) : (
              <ul className="equipo-list">
                {clientesFiltrados.map((c) => {
                  const row = normalizeClienteRow(c)
                  return (
                    <li key={row.id ?? row.nombre} className="equipo-card cliente-card-row">
                      <button type="button" className="equipo-card-main" onClick={() => abrirAcciones(row)}>
                        <strong>{row.nombre || 'Sin nombre'}</strong>
                        <span className="muted">📞 {row.telefono || 'Sin teléfono'}</span>
                        {row.domicilio ? <span className="muted small">🏠 {row.domicilio}</span> : null}
                        {row.correo ? <span className="muted small">✉️ {row.correo}</span> : null}
                      </button>
                      <div className="equipo-card-actions clientes-lista-card-actions">
                        <button
                          type="button"
                          className="btn-icon edit clientes-lista-btn-icon"
                          onClick={() => abrirEditar(row)}
                          title="Editar"
                          aria-label="Editar"
                        >
                          ✏️
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {dialogoCliente && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogoCliente(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{clienteEditando ? 'Editar Cliente' : 'Agregar Cliente'}</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Nombre
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value.toUpperCase())}
                  placeholder="Nombre del cliente"
                />
              </label>
              <label>
                Teléfono
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" />
              </label>
              <label>
                Domicilio
                <input
                  value={domicilio}
                  onChange={(e) => setDomicilio(e.target.value.toUpperCase())}
                  placeholder="Domicilio"
                />
              </label>
              <label>
                Correo
                <input
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value.toLowerCase())}
                  placeholder="Correo"
                />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setDialogoCliente(false)}>
                Cancelar
              </button>
              <button type="button" onClick={solicitarGuardarCliente}>
                {clienteEditando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmarDatosModal
        open={modalConfirmGuardarCliente}
        onClose={() => {
          setModalConfirmGuardarCliente(false)
          setCoincidenciasCliente([])
        }}
        onConfirm={ejecutarGuardarCliente}
        tituloGrupo={
          coincidenciasCliente.length > 0
            ? 'Posibles clientes similares'
            : clienteEditando
              ? 'Datos del cliente (actualizar)'
              : 'Datos del cliente (nuevo)'
        }
        lineas={
          coincidenciasCliente.length > 0
            ? [
                { label: 'Pregunta', value: 'Es el mismo cliente?' },
                { label: 'Nuevo nombre', value: nombre.trim().toUpperCase() },
                { label: 'Nuevo teléfono', value: telefono.trim() },
                ...coincidenciasCliente.map((c, i) => ({
                  label: `Similar ${i + 1}`,
                  value: `${String(c.nombre ?? '').toUpperCase()} · ${c.telefono || 'SIN TELEFONO'}`,
                })),
              ]
            : [
                { label: 'Nombre', value: nombre.trim().toUpperCase() },
                { label: 'Teléfono', value: telefono.trim() },
                { label: 'Domicilio', value: domicilio.trim().toUpperCase() },
                { label: 'Correo', value: correo.trim().toLowerCase() },
              ]
        }
        confirmando={guardandoCliente}
        textoConfirmar={
          coincidenciasCliente.length > 0
            ? 'No, es diferente. Guardar'
            : clienteEditando
              ? 'Confirmar y actualizar'
              : 'Confirmar y guardar'
        }
      />

      {modalAcciones && clienteAccion && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setModalAcciones(false); setClienteAccion(null) }}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Acciones para {clienteAccion.nombre || 'Cliente'}</h3>
            </div>
            <div className="modal-body">
              <p className="muted">Selecciona una acción:</p>
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="btn-servicio" onClick={() => void buscarOrdenesServicioCliente()}>
                Servicio
              </button>
              <button type="button" className="btn-cuentas" onClick={() => void abrirCuentasVentasCliente()}>
                Cuentas / Ventas
              </button>
              <button
                type="button"
                className="btn-cancelar"
                onClick={() => {
                  setModalAcciones(false)
                  setClienteAccion(null)
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCuentasVentas && clienteAccion && (
        <div className="modal-backdrop" role="presentation" onClick={cerrarModalCuentasVentas}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{cuentaTitle}</h3>
            </div>
            <div className="modal-body modal-body--ordenes-cliente">
              <ClientesCuentasVentasPanel
                loading={loadingCuentas}
                errorSubtitle={cuentaTitle === 'Error de búsqueda' ? cuentaSubtitle : null}
                cuentaResumen={cuentaResumen}
                cuentas={cuentasEncontradas}
                pagosCliente={pagosClienteCuentas}
                onSelectCuenta={(cuenta) => seleccionarCuentaVentas(cuenta)}
                puedeEliminar={puedeEliminar}
                onEliminarCuenta={handleEliminarCuenta}
              />
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button
                type="button"
                className="btn-agregar-equipo modal-btn-compact"
                onClick={() => void nuevaCuentaVentasCliente()}
              >
                Nueva Cuenta
              </button>
              <button type="button" className="secondary" onClick={cerrarModalCuentasVentas}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRepActivas && clienteAccion && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalRepActivas(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{repTitle}</h3>
            </div>
            <div className="modal-body modal-body--ordenes-cliente">
              <ClientesOrdenesServicioPanel
                loading={loadingReps}
                errorSubtitle={repTitle === 'Error de búsqueda' ? repSubtitle : null}
                repResumen={repResumen}
                reparaciones={repsActivas}
                equiposPorId={equiposPorIdOrdenes}
                cuentasPorReparaId={cuentasPorReparaOrdenes}
                pagosPorCuentaId={ymdPagoPorCuentaOrdenes}
                onSelectRep={(rep) => void seleccionarOrdenCliente(rep)}
              />
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="btn-agregar-equipo modal-btn-compact" onClick={nuevaReparacionIrServicios}>
                Nueva Reparación
              </button>
              <button type="button" className="secondary" onClick={() => setModalRepActivas(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {cargandoEquipoRep && (
        <div className="modal-backdrop">
          <div className="modal modal-narrow modal-alerta modal-alerta--info">
            <div className="modal-header">
              <h3>Cargando información</h3>
            </div>
            <div className="modal-body center">
              <p className="muted">Espere un momento por favor…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
