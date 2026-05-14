/* eslint-disable react-hooks/set-state-in-effect -- carga de reparación existente vía Supabase/local */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { buildEtiquetaQrPlainText } from './etiquetaLink.js'
import { ESTATUS_ORDEN, NIVELES_TINTA_PCT, TIPOS_EQUIPO_REPARACION, TIPOS_REPARACION } from './catalogos.js'
import { leerTecnicos, combinarTecnicos, separarTecnicos } from './tecnicosCatalogo.js'
import { abrirWhatsAppOrden, enviarOrdenWhatsAppCloudApi, normalizarTelefonoWa } from './whatsappUtils.js'

const LS_REP = 'sistefix_local_reparaciones'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_CAT = 'sistefix_local_catalogopagos'
const LS_PAGOS = 'sistefix_local_pagosclientes'

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

let __localRepSeq = 1
function nextLocalId() {
  __localRepSeq += 1
  return __localRepSeq
}

function resolveReparacionId(idReparacion, numeroOrden, repIdStr) {
  if (idReparacion != null && Number.isFinite(Number(idReparacion))) return Number(idReparacion)
  if (numeroOrden) {
    const n = Number(numeroOrden)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (repIdStr) {
    const n = Number(repIdStr)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function combineNiveles(b, y, c, m, cLight, mLight) {
  const parts = []
  if (b) parts.push(b)
  if (y) parts.push(y)
  if (c) parts.push(c)
  if (m) parts.push(m)
  if (cLight) parts.push(cLight)
  if (mLight) parts.push(mLight)
  return parts.length ? parts.join(' ') : null
}

function parseNiveles(str) {
  const out = { b: '', y: '', m: '', c: '', mL: '', cL: '' }
  if (!str || !String(str).trim()) return out
  const v = String(str).trim().split(/\s+/).filter(Boolean)
  if (v.length >= 6) {
    out.b = v[0]
    out.y = v[1]
    out.m = v[2]
    out.c = v[3]
    out.mL = v[4]
    out.cL = v[5]
  } else {
    out.b = v[0] ?? ''
    out.y = v[1] ?? ''
    out.m = v[2] ?? ''
    out.c = v[3] ?? ''
    out.mL = v[4] ?? ''
    out.cL = v[5] ?? ''
  }
  return out
}

/** Error de Postgres por índice único (evita duplicar cuenta u orden al reintentar). */
function esViolacionUnica(err) {
  const code = String(err?.code ?? '')
  if (code === '23505') return true
  const msg = String(err?.message ?? err?.details ?? '').toLowerCase()
  return msg.includes('duplicate') || msg.includes('unique')
}

export default function ReparacionesOrden({
  supabase,
  session,
  onSalir,
  onError,
  onNotice,
  /** Si true, no se muestra la franja azul "Reparaciones" (el padre ya muestra el título, p. ej. OrdenServicioModulo). */
  omitOuterHeader = false,
}) {
  const s = session ?? {}
  const repIdStr = s.reparacionId != null ? String(s.reparacionId).trim() : ''
  const [numeroOrden, setNumeroOrden] = useState(() => (repIdStr ? repIdStr : ''))
  const [serieEquipo, setSerieEquipo] = useState(() => s.equipoSerie ?? '')
  const [tipoEquipo, setTipoEquipo] = useState(() => s.equipoTipo ?? '')
  const [tipoReparacion, setTipoReparacion] = useState(() => s.equipoTipoReparacion ?? '')
  const [estatus, setEstatus] = useState('INGRESADO')
  const [descripcionEquipo, setDescripcionEquipo] = useState(() => s.equipoDescripcion ?? '')
  const [problemasReportados, setProblemasReportados] = useState('')
  const [tecnico1, setTecnico1] = useState('')
  const [tecnico2, setTecnico2] = useState('')
  const [tecnicosCatalogo] = useState(() => leerTecnicos())
  const [nivelB, setNivelB] = useState('')
  const [nivelY, setNivelY] = useState('')
  const [nivelM, setNivelM] = useState('')
  const [nivelC, setNivelC] = useState('')
  const [nivelMlight, setNivelMlight] = useState('')
  const [nivelClight, setNivelClight] = useState('')
  const [descripcionSolucion, setDescripcionSolucion] = useState('')
  const [ordenRegistrada, setOrdenRegistrada] = useState(() => Boolean(repIdStr))
  const [idReparacion, setIdReparacion] = useState(() => {
    const n = Number(repIdStr)
    return Number.isFinite(n) && repIdStr ? n : null
  })
  const [clienteIdNum, setClienteIdNum] = useState(null)

  const [dialogExito, setDialogExito] = useState(false)
  const [msgExito, setMsgExito] = useState('')

  const [confirmGuardarAbierto, setConfirmGuardarAbierto] = useState(false)
  const [eliminarConfirmAbierto, setEliminarConfirmAbierto] = useState(false)
  const [eliminandoOrden, setEliminandoOrden] = useState(false)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const guardandoRef = useRef(false)
  const [actualizandoOrden, setActualizandoOrden] = useState(false)
  const actualizandoRef = useRef(false)
  const [abriendoAnticipo, setAbriendoAnticipo] = useState(false)
  const [registrandoAnticipo, setRegistrandoAnticipo] = useState(false)
  const registrandoAnticipoRef = useRef(false)

  const [pagoModal, setPagoModal] = useState(false)
  const [catalogo, setCatalogo] = useState([])
  const [busqPago, setBusqPago] = useState('')
  const [selCat, setSelCat] = useState(null)
  const [cantPago, setCantPago] = useState('1')
  const [valorPago, setValorPago] = useState('')
  const [formaPago, setFormaPago] = useState('EFECTIVO')
  const [cuentaIdPago, setCuentaIdPago] = useState(null)
  /** Datos de cliente cargados por `cliente_id` cuando la sesión no trae nombre/teléfono. */
  const [clienteDesdeBd, setClienteDesdeBd] = useState(null)

  const esOrdenExistente = repIdStr.length > 0

  const cargarReparacion = useCallback(async () => {
    if (!repIdStr) return
    const id = Number(repIdStr)
    if (!Number.isFinite(id)) return
    try {
      if (supabase) {
        const { data, error } = await supabase.from('reparaciones').select('*').eq('id', id).maybeSingle()
        if (error) throw error
        if (!data) return
        setNumeroOrden(String(data.id))
        setTipoReparacion(data.tipo_reparacion ?? '')
        setEstatus(data.estatus ?? 'INGRESADO')
        setDescripcionEquipo(data.descripcion_equipo ?? '')
        setProblemasReportados(data.problemas_reportados ?? '')
        setDescripcionSolucion(data.descripcion_solucion ?? '')
        const [t1, t2] = separarTecnicos(data.tecnico)
        setTecnico1(t1)
        setTecnico2(t2)
        setIdReparacion(data.id)
        setOrdenRegistrada(true)
        setClienteIdNum(data.cliente_id ?? null)
        const nv = parseNiveles(data.niveles_tinta)
        setNivelB(nv.b)
        setNivelY(nv.y)
        setNivelM(nv.m)
        setNivelC(nv.c)
        setNivelMlight(nv.mL)
        setNivelClight(nv.cL)
        if (supabase && data.equipo_id) {
          const { data: eq } = await supabase.from('equipos').select('*').eq('id', data.equipo_id).maybeSingle()
          if (eq) {
            setSerieEquipo(eq.serie ?? '')
            setTipoEquipo(eq.tipo_equipo ?? '')
          }
        }
        if (data.cliente_id != null) {
          const { data: cx } = await supabase.from('clientes').select('*').eq('id', data.cliente_id).maybeSingle()
          setClienteDesdeBd(cx ? normalizeClienteRow(cx) : null)
        } else {
          setClienteDesdeBd(null)
        }
      } else {
        const all = readLs(LS_REP, [])
        const data = all.find((r) => r.id === id)
        if (!data) return
        setNumeroOrden(String(data.id))
        setTipoReparacion(data.tipo_reparacion ?? '')
        setEstatus(data.estatus ?? 'INGRESADO')
        setDescripcionEquipo(data.descripcion_equipo ?? '')
        setProblemasReportados(data.problemas_reportados ?? '')
        setDescripcionSolucion(data.descripcion_solucion ?? '')
        const [t1, t2] = separarTecnicos(data.tecnico)
        setTecnico1(t1)
        setTecnico2(t2)
        setIdReparacion(data.id)
        setOrdenRegistrada(true)
        setClienteIdNum(data.cliente_id ?? null)
        const nv = parseNiveles(data.niveles_tinta)
        setNivelB(nv.b)
        setNivelY(nv.y)
        setNivelM(nv.m)
        setNivelC(nv.c)
        setNivelMlight(nv.mL)
        setNivelClight(nv.cL)
        const eq = readLs(LS_EQUIPOS, []).find((e) => sameId(e.id, data.equipo_id))
        if (eq) {
          setSerieEquipo(eq.serie ?? '')
          setTipoEquipo(eq.tipo_equipo ?? '')
        }
        if (data.cliente_id != null) {
          const cl = readLs(LS_CLIENTES, []).find((c) => sameId(c.id, data.cliente_id))
          setClienteDesdeBd(cl ? normalizeClienteRow(cl) : null)
        } else {
          setClienteDesdeBd(null)
        }
      }
    } catch (e) {
      onError(`Error al cargar orden: ${e.message}`)
    }
  }, [repIdStr, supabase, onError])

  useEffect(() => {
    cargarReparacion()
  }, [cargarReparacion])

  async function resolverClienteId() {
    if (clienteIdNum != null) return clienteIdNum
    if (clienteDesdeBd?.id != null) {
      setClienteIdNum(clienteDesdeBd.id)
      return clienteDesdeBd.id
    }
    const nom = (s.clienteNombre ?? clienteDesdeBd?.nombre ?? '').trim()
    const tel = (s.clienteTelefono ?? clienteDesdeBd?.telefono ?? '').trim()
    if (!nom || !tel) return null
    if (supabase) {
      const { data, error } = await supabase.from('clientes').select('*')
      if (error) throw error
      const c = (data ?? [])
        .map(normalizeClienteRow)
        .find((x) => x.nombre.toLowerCase() === nom.toLowerCase() && String(x.telefono) === tel)
      if (c?.id != null) {
        setClienteIdNum(c.id)
        return c.id
      }
    } else {
      const c = readLs(LS_CLIENTES, [])
        .map(normalizeClienteRow)
        .find((x) => x.nombre.toLowerCase() === nom.toLowerCase() && String(x.telefono) === tel)
      if (c?.id != null) {
        setClienteIdNum(c.id)
        return c.id
      }
    }
    return null
  }

  async function resolverEquipoId() {
    const ser = String(serieEquipo).trim()
    if (!ser) return null
    if (supabase) {
      const { data, error } = await supabase.from('equipos').select('*')
      if (error) throw error
      const e = (data ?? []).find((x) => String(x.serie) === ser)
      return e?.id ?? null
    }
    const e = readLs(LS_EQUIPOS, []).find((x) => String(x.serie) === ser)
    return e?.id ?? null
  }

  /**
   * Registra una orden nueva. Devuelve true solo si reparación + cuenta quedaron creadas.
   * Evita doble inserción (doble clic) y revierte la reparación si falla la cuenta en Supabase.
   */
  async function insertarReparacion() {
    if (guardandoRef.current) return false
    if (ordenRegistrada) return false
    guardandoRef.current = true
    setGuardandoOrden(true)
    try {
      const cid = await resolverClienteId()
      const eid = await resolverEquipoId()
      if (cid == null) {
        setMsgExito(
          `No se encontró el cliente con nombre "${(s.clienteNombre ?? clienteDesdeBd?.nombre ?? '').trim() || '(vacío)'}" y teléfono "${(s.clienteTelefono ?? clienteDesdeBd?.telefono ?? '').trim() || '(vacío)'}".`,
        )
        setDialogExito(true)
        return false
      }
      if (eid == null) {
        setMsgExito(`No se encontró el equipo con serie "${serieEquipo}".`)
        setDialogExito(true)
        return false
      }
      const now = new Date().toISOString()
      const niveles = combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight)
      const row = {
        equipo_id: eid,
        cliente_id: cid,
        tecnico: combinarTecnicos(tecnico1, tecnico2),
        estatus,
        descripcion_equipo: descripcionEquipo || null,
        problemas_reportados: problemasReportados || null,
        niveles_tinta: niveles,
        descripcion_solucion: null,
        pago: null,
        costo_reparacion: null,
        fecha_creacion: now,
        updated_at: now,
        tipo_reparacion: tipoReparacion || null,
      }
      let newId
      if (supabase) {
        const { data: ins, error } = await supabase.from('reparaciones').insert(row).select('id').single()
        if (error) throw error
        newId = ins?.id
      } else {
        const all = readLs(LS_REP, [])
        newId = nextLocalId()
        writeLs(LS_REP, [{ id: newId, ...row }, ...all])
      }
      if (!newId) throw new Error('No se obtuvo ID de reparación')

      const cuenta = {
        cliente_id: cid,
        total: 0,
        estatus: 'PENDIENTE',
        created_at: now,
        fecha_liquidada: null,
        repara_id: newId,
        tipo_pago: null,
      }
      if (supabase) {
        const { data: yaCuenta, error: eSel } = await supabase.from('cuentas').select('id').eq('repara_id', newId).limit(1)
        if (eSel) throw eSel
        if (!(yaCuenta && yaCuenta.length > 0)) {
          const { error: ce } = await supabase.from('cuentas').insert(cuenta)
          if (ce) {
            const { error: eDel } = await supabase.from('reparaciones').delete().eq('id', newId)
            if (eDel) console.warn('No se pudo revertir la orden tras fallo de cuenta:', eDel.message)
            throw new Error(
              `No se pudo crear la cuenta vinculada (${ce.message}). La orden no quedó guardada; inténtelo de nuevo.`,
            )
          }
        }
      } else {
        const cu = readLs(LS_CUENTAS, [])
        if (!cu.some((c) => Number(c.repara_id) === Number(newId))) {
          writeLs(LS_CUENTAS, [{ id: nextLocalId(), ...cuenta }, ...cu])
        }
      }

      setIdReparacion(newId)
      setNumeroOrden(String(newId))
      setOrdenRegistrada(true)
      setClienteIdNum(cid)
      setMsgExito(`Se registró la orden de servicio con ID: ${newId}.`)
      setDialogExito(true)
      onNotice('Orden registrada')
      return true
    } catch (e) {
      setMsgExito(`Error: ${e.message}`)
      setDialogExito(true)
      return false
    } finally {
      guardandoRef.current = false
      setGuardandoOrden(false)
    }
  }

  async function actualizarOrden() {
    if (actualizandoRef.current) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) return
    actualizandoRef.current = true
    setActualizandoOrden(true)
    const now = new Date().toISOString()
    const niveles = combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight)
    const patch = {
      estatus,
      tecnico: combinarTecnicos(tecnico1, tecnico2),
      descripcion_equipo: descripcionEquipo || null,
      problemas_reportados: problemasReportados || null,
      descripcion_solucion: descripcionSolucion ? descripcionSolucion.toUpperCase() : null,
      tipo_reparacion: tipoReparacion || null,
      niveles_tinta: niveles,
      updated_at: now,
    }
    try {
      if (supabase) {
        const { error } = await supabase.from('reparaciones').update(patch).eq('id', id)
        if (error) throw error
      } else {
        const all = readLs(LS_REP, [])
        writeLs(
          LS_REP,
          all.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        )
      }

      const tipoEquipoNuevo = String(tipoEquipo).trim()
      if (tipoEquipoNuevo) {
        const eid = await resolverEquipoId()
        if (eid != null) {
          if (supabase) {
            const { error: eqErr } = await supabase
              .from('equipos')
              .update({ tipo_equipo: tipoEquipoNuevo })
              .eq('id', eid)
            if (eqErr) console.warn('No se pudo actualizar tipo_equipo del equipo:', eqErr.message)
          } else {
            const allEq = readLs(LS_EQUIPOS, [])
            writeLs(
              LS_EQUIPOS,
              allEq.map((e) => (sameId(e.id, eid) ? { ...e, tipo_equipo: tipoEquipoNuevo } : e)),
            )
          }
        }
      }

      onNotice('Orden actualizada')
      setMsgExito('Cambios guardados.')
      setDialogExito(true)
    } catch (e) {
      onError(`Error al actualizar: ${e.message}`)
    } finally {
      actualizandoRef.current = false
      setActualizandoOrden(false)
    }
  }

  async function eliminarOrden() {
    if (eliminandoOrden) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) {
      onError('No hay orden para eliminar')
      return
    }
    setEliminandoOrden(true)
    try {
      let cuentasIds = []
      if (supabase) {
        const { data: cu, error: eCu } = await supabase
          .from('cuentas')
          .select('id')
          .eq('repara_id', id)
        if (eCu) throw eCu
        cuentasIds = (cu ?? []).map((c) => c.id)
        if (cuentasIds.length > 0) {
          const { error: ePag } = await supabase
            .from('pagosclientes')
            .delete()
            .in('cuenta_id', cuentasIds)
          if (ePag) throw ePag
          const { error: eCuDel } = await supabase
            .from('cuentas')
            .delete()
            .eq('repara_id', id)
          if (eCuDel) throw eCuDel
        }
        const { error: eRep } = await supabase.from('reparaciones').delete().eq('id', id)
        if (eRep) throw eRep
      } else {
        cuentasIds = readLs(LS_CUENTAS, [])
          .filter((c) => Number(c.repara_id) === Number(id))
          .map((c) => c.id)
        if (cuentasIds.length > 0) {
          writeLs(
            LS_PAGOS,
            readLs(LS_PAGOS, []).filter((p) => !cuentasIds.some((cid) => sameId(cid, p.cuenta_id))),
          )
          writeLs(
            LS_CUENTAS,
            readLs(LS_CUENTAS, []).filter((c) => Number(c.repara_id) !== Number(id)),
          )
        }
        writeLs(
          LS_REP,
          readLs(LS_REP, []).filter((r) => Number(r.id) !== Number(id)),
        )
      }
      setEliminarConfirmAbierto(false)
      onNotice(`Orden #${id} eliminada correctamente`)
      onSalir?.()
    } catch (e) {
      onError(`Error al eliminar orden: ${e.message}`)
    } finally {
      setEliminandoOrden(false)
    }
  }

  async function abrirAnticipo() {
    if (abriendoAnticipo) return
    const rid = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!rid || !Number.isFinite(Number(rid))) {
      onError('Primero debe generar la orden de servicio')
      return
    }
    const cid = await resolverClienteId()
    if (cid == null) {
      onError('No se pudo obtener el cliente')
      return
    }
    setAbriendoAnticipo(true)
    try {
      let cuenta
      if (supabase) {
        const { data: rows, error } = await supabase
          .from('cuentas')
          .select('*')
          .eq('repara_id', rid)
          .order('id', { ascending: false })
          .limit(1)
        if (error) throw error
        cuenta = rows?.[0] ?? null
      } else {
        const matches = readLs(LS_CUENTAS, []).filter((c) => Number(c.repara_id) === Number(rid))
        cuenta =
          matches.length === 0
            ? null
            : [...matches].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0]
      }
      if (!cuenta?.id) {
        const nueva = {
          cliente_id: cid,
          repara_id: Number(rid),
          total: 0,
          estatus: 'PENDIENTE',
          tipo_pago: 'EFECTIVO',
        }
        if (supabase) {
          const { data, error } = await supabase.from('cuentas').insert(nueva).select('*').single()
          if (error) {
            if (esViolacionUnica(error)) {
              const { data: rows2, error: e2 } = await supabase
                .from('cuentas')
                .select('*')
                .eq('repara_id', rid)
                .order('id', { ascending: false })
                .limit(1)
              if (e2) throw e2
              cuenta = rows2?.[0] ?? null
              if (!cuenta?.id) throw new Error('Cuenta duplicada detectada pero no se pudo recuperar.')
            } else {
              throw error
            }
          } else {
            cuenta = data
          }
        } else {
          const id = nextLocalId()
          cuenta = { id, ...nueva }
          const all = readLs(LS_CUENTAS, [])
          if (!all.some((c) => Number(c.repara_id) === Number(rid))) {
            writeLs(LS_CUENTAS, [cuenta, ...all])
          } else {
            const m = all.filter((c) => Number(c.repara_id) === Number(rid))
            cuenta = [...m].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0]
          }
        }
      }
      if (!cuenta?.id) {
        throw new Error('No se pudo obtener o crear la cuenta de cobro para esta orden.')
      }
      setCuentaIdPago(cuenta.id)
      if (supabase) {
        const { data, error } = await supabase.from('catalogopagos').select('*')
        if (error) throw error
        setCatalogo(data ?? [])
      } else {
        setCatalogo(readLs(LS_CAT, []))
      }
      setSelCat(null)
      setCantPago('1')
      setValorPago('')
      setBusqPago('')
      setFormaPago('EFECTIVO')
      setPagoModal(true)
    } catch (e) {
      onError(`Error al abrir anticipo: ${e.message}`)
    } finally {
      setAbriendoAnticipo(false)
    }
  }

  async function registrarPago() {
    if (registrandoAnticipoRef.current) return
    if (!selCat || !cuentaIdPago) return
    const cant = Number(cantPago)
    const val = Number(valorPago)
    if (!Number.isFinite(cant) || !Number.isFinite(val)) {
      onError('Cantidad y valor numéricos requeridos')
      return
    }
    const cid = await resolverClienteId()
    if (cid == null) return
    const monto = cant * val
    const row = {
      cliente_id: cid,
      cuenta_id: cuentaIdPago,
      pago: monto,
      concepto: selCat.concepto ?? 'Anticipo',
      forma_pago: formaPago,
    }
    registrandoAnticipoRef.current = true
    setRegistrandoAnticipo(true)
    try {
      if (supabase) {
        const { error } = await supabase.from('pagosclientes').insert(row)
        if (error) throw error
      } else {
        const all = readLs(LS_PAGOS, [])
        writeLs(LS_PAGOS, [{ id: nextLocalId(), ...row }, ...all])
      }
      setPagoModal(false)
      onNotice(`Anticipo registrado: $${monto.toFixed(2)} (${row.forma_pago})`)
    } catch (e) {
      onError(`Error al registrar anticipo: ${e.message}`)
    } finally {
      registrandoAnticipoRef.current = false
      setRegistrandoAnticipo(false)
    }
  }

  const catFiltrado = useMemo(() => {
    const t = busqPago.trim().toLowerCase()
    if (!t) return catalogo
    return catalogo.filter((c) => String(c.concepto ?? '').toLowerCase().includes(t))
  }, [catalogo, busqPago])

  const nombreClienteUi = clienteDesdeBd?.nombre || s.clienteNombre || ''
  const telClienteUi = clienteDesdeBd?.telefono || s.clienteTelefono || ''
  const domClienteUi = clienteDesdeBd?.domicilio || s.clienteDomicilio || ''
  const correoClienteUi = clienteDesdeBd?.correo || s.clienteCorreo || ''
  const puedeAccionesPdf = ordenRegistrada || idReparacion != null

  async function imprimirEtiquetas() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || '—'
    const nombre = nombreClienteUi || '—'
    const equipoParts = []
    if (serieEquipo) equipoParts.push(`Serie: ${serieEquipo}`)
    if (tipoEquipo) equipoParts.push(`Tipo: ${tipoEquipo}`)
    if (descripcionEquipo) equipoParts.push(descripcionEquipo)
    const equipoText = equipoParts.length ? equipoParts.join(' — ') : '—'
    const qrText = buildEtiquetaQrPlainText({
      nombre: nombreClienteUi,
      orden: ord,
      equipo: equipoText,
    })
    let qrDataUrl
    try {
      const QRCode = (await import('qrcode')).default
      qrDataUrl = await QRCode.toDataURL(qrText, {
        errorCorrectionLevel: 'L',
        margin: 1,
        width: 400,
        color: { dark: '#000000', light: '#ffffff' },
      })
    } catch {
      onError('No se pudo generar el código QR para la etiqueta.')
      return
    }

    try {
      const { downloadEtiquetaPdf } = await import('./etiquetaPdf.js')
      downloadEtiquetaPdf({ nombre, orden: ord, qrDataUrl })
      onNotice('PDF de etiqueta descargado (2×1 in).')
    } catch (e) {
      onError(`No se pudo generar el PDF de la etiqueta: ${e?.message ?? e}`)
    }
  }

  async function enviarOrdenPdf() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || '—'
    const nt = combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight) ?? ''
    try {
      const { downloadOrdenServicioPdf } = await import('./ordenServicioPdf.js')
      downloadOrdenServicioPdf({
        orden: ord,
        cliente: {
          nombre: nombreClienteUi,
          telefono: telClienteUi,
          correo: correoClienteUi,
          domicilio: domClienteUi,
        },
        equipo: {
          serie: serieEquipo,
          tipo: tipoEquipo,
          descripcion: descripcionEquipo,
        },
        servicio: {
          tipoReparacion,
          estatus,
          tecnico: combinarTecnicos(tecnico1, tecnico2),
          problemas: problemasReportados,
          nivelesTinta: nt,
        },
        solucion: descripcionSolucion,
      })
      onNotice('PDF de orden de servicio descargado.')
    } catch (e) {
      onError(`No se pudo generar el PDF de la orden: ${e?.message ?? e}`)
    }
  }

  async function enviarWhatsAppOrden() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || ''
    if (!ord) {
      onError('Primero registra la orden de servicio para enviar el mensaje.')
      return
    }
    if (supabase) {
      const toDigits = normalizarTelefonoWa(telClienteUi)
      const res = await enviarOrdenWhatsAppCloudApi(supabase, {
        orden: ord,
        nombreCliente: nombreClienteUi,
        ...(toDigits ? { to: toDigits } : {}),
      })
      if (res.ok) {
        onNotice('Mensaje enviado por WhatsApp (Cloud API). Revisa tu teléfono.')
        return
      }
      onError(res.errorMsg || 'No se pudo enviar el mensaje por WhatsApp API.')
      return
    }
    const wa = abrirWhatsAppOrden({ telefono: telClienteUi, numeroOrden: ord })
    if (wa.ok) {
      onNotice('Mensaje listo en WhatsApp. Pulsa enviar para que llegue al cliente.')
      return
    }
    if (wa.motivo === 'sin-telefono') {
      onError('El cliente no tiene un teléfono registrado.')
    } else if (wa.motivo === 'telefono-invalido') {
      onError(`El teléfono "${telClienteUi}" no tiene un formato válido para WhatsApp.`)
    } else if (wa.motivo === 'popup-bloqueado') {
      onError('El navegador bloqueó la ventana de WhatsApp. Permite ventanas emergentes e intenta de nuevo.')
    }
  }

  return (
    <div className="rep-root">
      {!omitOuterHeader ? (
        <header className="rep-header-bar">
          <h1>Reparaciones</h1>
        </header>
      ) : null}

      <div className="rep-scroll">
        <div className="rep-block highlight">
          <label>No de Orden</label>
          <input value={numeroOrden} onChange={(e) => setNumeroOrden(e.target.value)} placeholder="No de Orden" readOnly={ordenRegistrada} />
        </div>

        <div className="rep-block">
          <label>Serie del equipo</label>
          <input
            value={serieEquipo}
            onChange={(e) => setSerieEquipo(e.target.value.toUpperCase())}
            placeholder="Serie del equipo"
            disabled={ordenRegistrada && esOrdenExistente}
          />
        </div>

        <div className="rep-block">
          <label>Tipo Equipo</label>
          <select value={tipoEquipo} onChange={(e) => setTipoEquipo(e.target.value)}>
            <option value="">Seleccionar tipo</option>
            {TIPOS_EQUIPO_REPARACION.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="rep-block">
          <label>Descripcion del equipo</label>
          <textarea
            rows={3}
            value={descripcionEquipo}
            onChange={(e) => setDescripcionEquipo(e.target.value.toUpperCase())}
            placeholder="Descripcion del equipo"
          />
        </div>

        <div className="rep-block">
          <label>Tipo Reparacion</label>
          <select value={tipoReparacion} onChange={(e) => setTipoReparacion(e.target.value)}>
            <option value="">Seleccionar tipo</option>
            {TIPOS_REPARACION.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="rep-block highlight">
          <label>Problemas reportados</label>
          <textarea
            rows={3}
            value={problemasReportados}
            onChange={(e) => setProblemasReportados(e.target.value.toUpperCase())}
            placeholder="Problemas reportados"
          />
        </div>

        <h2 className="rep-subtitle">Niveles de Tinta</h2>
        <div className="tinta-grid">
          <div className="tinta-swatch tinta-swatch--black">
            <span className="tinta-swatch-title">BLACK</span>
            <input
              className="tinta-pct-input"
              value={nivelB}
              onChange={(e) => setNivelB(e.target.value)}
              placeholder="%"
              list="pct-opts"
              inputMode="numeric"
              maxLength={5}
              aria-label="Nivel de tinta black, porcentaje"
            />
          </div>
          <div className="tinta-swatch tinta-swatch--yellow">
            <span className="tinta-swatch-title">YELLOW</span>
            <input
              className="tinta-pct-input"
              value={nivelY}
              onChange={(e) => setNivelY(e.target.value)}
              placeholder="%"
              list="pct-opts"
              inputMode="numeric"
              maxLength={5}
              aria-label="Nivel de tinta yellow, porcentaje"
            />
          </div>
          <div className="tinta-swatch tinta-swatch--magenta">
            <span className="tinta-swatch-title">MAGENTA</span>
            <input
              className="tinta-pct-input"
              value={nivelM}
              onChange={(e) => setNivelM(e.target.value)}
              placeholder="%"
              list="pct-opts"
              inputMode="numeric"
              maxLength={5}
              aria-label="Nivel de tinta magenta, porcentaje"
            />
          </div>
          <div className="tinta-swatch tinta-swatch--cyan">
            <span className="tinta-swatch-title">CYAN</span>
            <input
              className="tinta-pct-input"
              value={nivelC}
              onChange={(e) => setNivelC(e.target.value)}
              placeholder="%"
              list="pct-opts"
              inputMode="numeric"
              maxLength={5}
              aria-label="Nivel de tinta cyan, porcentaje"
            />
          </div>
          <div className="tinta-swatch tinta-swatch--magenta-light">
            <span className="tinta-swatch-title">MAGENTA LIGHT</span>
            <input
              className="tinta-pct-input"
              value={nivelMlight}
              onChange={(e) => setNivelMlight(e.target.value)}
              placeholder="%"
              list="pct-opts"
              inputMode="numeric"
              maxLength={5}
              aria-label="Nivel de tinta magenta light, porcentaje"
            />
          </div>
          <div className="tinta-swatch tinta-swatch--cyan-light">
            <span className="tinta-swatch-title">CYAN LIGHT</span>
            <input
              className="tinta-pct-input"
              value={nivelClight}
              onChange={(e) => setNivelClight(e.target.value)}
              placeholder="%"
              list="pct-opts"
              inputMode="numeric"
              maxLength={5}
              aria-label="Nivel de tinta cyan light, porcentaje"
            />
          </div>
        </div>
        <datalist id="pct-opts">
          {NIVELES_TINTA_PCT.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <div className="rep-block estatus-row">
          <label>Estatus</label>
          <div className="estatus-inner">
            <input
              value={estatus}
              readOnly
              placeholder="Selecciona un estatus →"
              aria-readonly="true"
              tabIndex={-1}
            />
            <select className="estatus-select" value="" onChange={(e) => e.target.value && setEstatus(e.target.value)}>
              <option value="">Seleccionar</option>
              {ESTATUS_ORDEN.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rep-block tecnicos-row">
          <label>Técnico(s) asignado(s)</label>
          <div className="tecnicos-selects">
            <select value={tecnico1} onChange={(e) => setTecnico1(e.target.value)}>
              <option value="">— Técnico 1 —</option>
              {tecnicosCatalogo.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="tecnicos-amp" aria-hidden="true">&amp;</span>
            <select value={tecnico2} onChange={(e) => setTecnico2(e.target.value)}>
              <option value="">— Técnico 2 (opcional) —</option>
              {tecnicosCatalogo
                .filter((t) => t !== tecnico1)
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {(esOrdenExistente || idReparacion != null) && (
          <div className="rep-block highlight">
            <label>Descripcion de la solucion</label>
            <textarea
              rows={3}
              value={descripcionSolucion}
              onChange={(e) => setDescripcionSolucion(e.target.value)}
              placeholder="Descripcion de la solucion"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
        )}

        <div className="rep-cliente-card">
          <strong>Cliente</strong>
          <span>{nombreClienteUi || '—'}</span>
          <span>Tel: {telClienteUi || '—'}</span>
          {domClienteUi ? <span>Dir: {domClienteUi}</span> : null}
          {correoClienteUi ? <span>Email: {correoClienteUi}</span> : null}
        </div>

        <div className="rep-actions">
          <button
            type="button"
            className="btn-primary wide"
            disabled={ordenRegistrada || guardandoOrden}
            onClick={() => setConfirmGuardarAbierto(true)}
          >
            {ordenRegistrada ? 'Orden Registrada' : 'Registrar Orden'}
          </button>
          {(esOrdenExistente || idReparacion != null) && (
            <button
              type="button"
              className="btn-secondary wide"
              disabled={actualizandoOrden}
              onClick={() => void actualizarOrden()}
            >
              {actualizandoOrden ? 'Guardando…' : 'Actualizar orden'}
            </button>
          )}
          <button type="button" className="btn-success wide" disabled={!puedeAccionesPdf} onClick={imprimirEtiquetas}>
            Imprimir etiqueta (PDF)
          </button>
          <button type="button" className="btn-primary wide" disabled={!puedeAccionesPdf} onClick={enviarOrdenPdf}>
            Enviar orden de servicio
          </button>
          <button
            type="button"
            className="btn-success wide"
            disabled={!puedeAccionesPdf || (!supabase && !telClienteUi)}
            onClick={() => void enviarWhatsAppOrden()}
            title={
              !supabase && !telClienteUi
                ? 'El cliente no tiene teléfono registrado'
                : supabase
                  ? 'Enviar plantilla de WhatsApp por Cloud API (ver secretos WHATSAPP_* en Supabase)'
                  : 'Abrir WhatsApp con un mensaje listo para el cliente'
            }
          >
            📲 Enviar por WhatsApp
          </button>
          <button
            type="button"
            className="btn-anticipo wide"
            disabled={abriendoAnticipo || !puedeAccionesPdf}
            onClick={() => void abrirAnticipo()}
          >
            {abriendoAnticipo ? 'Abriendo…' : 'Recibir anticipo'}
          </button>
          {(esOrdenExistente || idReparacion != null) && (
            <button
              type="button"
              className="btn-eliminar-orden wide"
              onClick={() => setEliminarConfirmAbierto(true)}
            >
              🗑️ Eliminar orden
            </button>
          )}
          <button type="button" className="btn-danger wide" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>

      {dialogExito && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogExito(false)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{idReparacion ? 'Éxito' : 'Mensaje'}</h3>
            </div>
            <div className="modal-body">
              <p>{msgExito}</p>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setDialogExito(false)}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {pagoModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPagoModal(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 Recibir anticipo</h3>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Seleccione un concepto del catálogo, ajuste el monto y la forma de pago, y registre el anticipo.
              </p>
            </div>
            <div className="modal-body">
              <input
                className="full"
                placeholder="Buscar por concepto..."
                value={busqPago}
                onChange={(e) => setBusqPago(e.target.value)}
              />
              <ul className="cat-pago-list">
                {catFiltrado.map((c) => (
                  <li key={c.id ?? c.concepto}>
                    <button
                      type="button"
                      className={`rep-card ${selCat === c ? 'selected' : ''}`}
                      onClick={() => {
                        setSelCat(c)
                        setCantPago('1')
                        setValorPago(String(c.cantidad ?? ''))
                      }}
                    >
                      <strong>{c.concepto}</strong>
                      <span>${Number(c.cantidad ?? 0).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {selCat && (
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
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setPagoModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void registrarPago()}
                disabled={!selCat || registrandoAnticipo}
              >
                {registrandoAnticipo ? 'Registrando…' : 'Registrar anticipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmGuardarAbierto && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !guardandoOrden && setConfirmGuardarAbierto(false)}
        >
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📝 ¿Seguro que quieres guardar estos datos?</h3>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Revise los datos antes de confirmar. El <strong>número de orden</strong> lo asigna la base de datos al
                guardar (consecutivo); no lo elige usted. Una vez guardada podrá editar la orden.
              </p>
            </div>
            <div className="modal-body">
              <div className="resumen-orden">
                <div className="resumen-orden-grupo">
                  <h4>👥 Cliente</h4>
                  <p><strong>Nombre:</strong> {nombreClienteUi || '—'}</p>
                  <p><strong>Teléfono:</strong> {telClienteUi || '—'}</p>
                  {domClienteUi ? <p><strong>Domicilio:</strong> {domClienteUi}</p> : null}
                  {correoClienteUi ? <p><strong>Correo:</strong> {correoClienteUi}</p> : null}
                </div>
                <div className="resumen-orden-grupo">
                  <h4>🖨️ Equipo</h4>
                  <p><strong>Serie:</strong> {serieEquipo || '—'}</p>
                  <p><strong>Tipo:</strong> {tipoEquipo || '—'}</p>
                  {descripcionEquipo ? <p><strong>Descripción:</strong> {descripcionEquipo}</p> : null}
                  <p><strong>Tipo de reparación:</strong> {tipoReparacion || '—'}</p>
                </div>
                <div className="resumen-orden-grupo">
                  <h4>📋 Orden</h4>
                  <p><strong>Estatus:</strong> {estatus || '—'}</p>
                  <p><strong>Técnico(s):</strong> {combinarTecnicos(tecnico1, tecnico2) || '— (sin asignar)'}</p>
                  <p>
                    <strong>Problemas reportados:</strong>{' '}
                    {problemasReportados ? problemasReportados : '— (vacío)'}
                  </p>
                  <p>
                    <strong>Niveles de tinta (B/Y/M/C/ML/CL):</strong>{' '}
                    {combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight) || '— (sin definir)'}
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmGuardarAbierto(false)}
                disabled={guardandoOrden}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-confirm-guardar"
                disabled={guardandoOrden}
                onClick={async () => {
                  if (guardandoRef.current) return
                  const ok = await insertarReparacion()
                  if (ok) setConfirmGuardarAbierto(false)
                }}
              >
                {guardandoOrden ? 'Guardando…' : '✅ Confirmar y guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {eliminarConfirmAbierto && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !eliminandoOrden && setEliminarConfirmAbierto(false)}
        >
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🗑️ Eliminar orden de servicio</h3>
            </div>
            <div className="modal-body">
              <p>
                ¿Seguro que deseas eliminar la orden{' '}
                <strong>#{idReparacion ?? numeroOrden ?? '—'}</strong> de{' '}
                <strong>{nombreClienteUi || 'el cliente'}</strong>?
              </p>
              <p className="muted small">
                Esta acción <strong>no se puede deshacer</strong>. También se eliminarán la cuenta asociada y todos los pagos/anticipos registrados.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setEliminarConfirmAbierto(false)}
                disabled={eliminandoOrden}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-eliminar-orden"
                onClick={() => void eliminarOrden()}
                disabled={eliminandoOrden}
              >
                {eliminandoOrden ? 'Eliminando…' : 'Sí, eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
