/* eslint-disable react-hooks/set-state-in-effect -- carga de reparación existente vía Supabase/local */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { TEXTO_VERIFICAR_DATOS } from './confirmarDatosUtils.js'
import { sincronizarEquipoParaOrden } from './ordenServicioSync.js'
import { NIVELES_TINTA_PCT, TIPOS_EQUIPO_REPARACION, TIPOS_REPARACION } from './catalogos.js'
import AlertaPermiso from './AlertaPermiso.jsx'
import ModalAlerta from './ModalAlerta.jsx'
import { cargarTecnicosUnificados, combinarTecnicos, separarTecnicos } from './tecnicosCatalogo.js'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import {
  abrirWhatsAppAnticipo,
  abrirWhatsAppLiquidacion,
  abrirWhatsAppOrden,
  enviarAnticipoWhatsAppCloudApi,
  enviarLiquidacionWhatsAppCloudApi,
  enviarOrdenWhatsAppCloudApi,
  enviarWhatsAppConRespaldoManual,
  formatFechaOrdenMensaje,
  formatMontoAnticipoWa,
  telefonoWaParaEnvio,
  resumenFormasPagoWa,
} from './whatsappUtils.js'
import {
  aYmdLocalDesdeRaw,
  esOrdenDuplicada,
  estatusEsEntregado,
  estatusPermiteVerificacionEntrega,
  estatusEsSinReparacion,
  estatusListoParaVerificacionEntrega,
  estatusSiguientesPermitidos,
  ejecutarInsercionOrdenUnica,
  estaVerificadoEntrega,
  formatFechaLegibleEsMx,
  finalizarBloqueoInsercionPestana,
  iniciarBloqueoInsercionPestana,
  actualizarReparacionSupabase,
  guardarVerificacionEntregaSupabase,
  agregarEntradaBitacora,
  bloqueaEntregaSinVerificacion,
  fechasHitosOrdenConVerificacion,
  formatFechaBitacora,
  insertarReparacionSupabase,
  leerOrdenRecienCreadaEnSesion,
  liquidarCuentaPagadaAlEntregarOrden,
  MENSAJE_VERIFICAR_ANTES_ENTREGADO,
  parseBitacora,
  patchFechasHitosEstatus,
  buildPatchCambioEstatusOrden,
  patchCompletarFechasHitosFaltantes,
  ymdIngresoPreservar,
  fechaIngresoFiltroYmd,
  patchVerificadoEntrega,
  persistirCambioEstatusOrdenSupabase,
  persistirFechasHitosFaltantesSupabase,
  registrarOrdenCreadaEnSesion,
  esGarantiaSinCobroTipo,
  esGarantiaEpsonTipo,
  etiquetaGarantiaSinCobro,
  validarTransicionEstatus,
  validarTransicionEstatusAlGuardar,
  vincularCuentaAOrdenSupabase,
  ymdFechaEntregaParaGuardar,
  cuentaSinOrdenVinculada,
  formatMontoCuenta,
  eliminarReparacionCompleta,
} from './reparacionUtils.js'

const LS_REP = 'sistefix_local_reparaciones'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'
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

/** Pago total por WhatsApp: cuenta liquidada o orden ya entregada al cliente. */
function puedeEnviarPagoTotalWhatsApp(cuenta, estatusOrden) {
  const estCuenta = String(cuenta?.estatus ?? '').trim().toUpperCase()
  if (estCuenta === 'LIQUIDADA') return true
  if (estatusEsEntregado(estatusOrden)) return true
  return false
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

function parseClienteIdFromSession(sess) {
  const raw = sess?.clienteId ?? sess?.cliente_id
  if (raw == null || raw === '') return null
  const n = Number(String(raw).trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseEquipoIdFromSession(sess) {
  const raw = sess?.equipoId ?? sess?.equipo_id
  if (raw == null || raw === '') return null
  const n = Number(String(raw).trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

/** True si la sesión trae un ID de reparación real (>0) a cargar desde BD. */
function repIdStrEsOrdenExistente(repIdStr) {
  const t = repIdStr != null ? String(repIdStr).trim() : ''
  if (!t) return false
  const n = Number(t)
  return Number.isFinite(n) && n > 0
}

function soloDigitosTel(t) {
  return String(t ?? '').replace(/\D/g, '')
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

/** Elige la cuenta más reciente entre varias filas. */
function elegirCuentaMasReciente(lista) {
  let cuenta = null
  for (const c of lista ?? []) {
    if (!cuenta) {
      cuenta = c
      continue
    }
    const tNew = new Date(c.updated_at ?? c.created_at ?? 0).getTime()
    const tPrev = new Date(cuenta.updated_at ?? cuenta.created_at ?? 0).getTime()
    if (tNew >= tPrev) cuenta = c
  }
  return cuenta
}

export default function ReparacionesOrden({
  supabase,
  session,
  onSalir,
  onError,
  onNotice,
  /** Abre la cuenta del cliente vinculada a esta orden (módulo Ventas). */
  onIrCuentaCliente,
  /** Si true, no se muestra la franja azul "Reparaciones" (el padre ya muestra el título, p. ej. OrdenServicioModulo). */
  omitOuterHeader = false,
  puedeEliminar = false,
}) {
  const { alertaPermiso, intentarEliminar, mostrarSinPermiso } = usePermisoEliminar(puedeEliminar)
  const s = session ?? {}
  const repIdStr = s.reparacionId != null ? String(s.reparacionId).trim() : ''
  const [numeroOrden, setNumeroOrden] = useState(() => (repIdStrEsOrdenExistente(repIdStr) ? repIdStr : ''))
  const [serieEquipo, setSerieEquipo] = useState(() => s.equipoSerie ?? '')
  const [tipoEquipo, setTipoEquipo] = useState(() => s.equipoTipo ?? '')
  const [tipoReparacion, setTipoReparacion] = useState(() => s.equipoTipoReparacion ?? '')
  const [folioEpson, setFolioEpson] = useState('')
  const [estatus, setEstatus] = useState('INGRESADO')
  const [descripcionEquipo, setDescripcionEquipo] = useState(() => s.equipoDescripcion ?? '')
  const [problemasReportados, setProblemasReportados] = useState('')
  const [tecnico1, setTecnico1] = useState('')
  const [tecnico2, setTecnico2] = useState('')
  const [tecnicosCatalogo, setTecnicosCatalogo] = useState(() => [])
  const [nivelB, setNivelB] = useState('')
  const [nivelY, setNivelY] = useState('')
  const [nivelM, setNivelM] = useState('')
  const [nivelC, setNivelC] = useState('')
  const [nivelMlight, setNivelMlight] = useState('')
  const [nivelClight, setNivelClight] = useState('')
  const [descripcionSolucion, setDescripcionSolucion] = useState('')
  const [bitacora, setBitacora] = useState('')
  const [bitacoraNueva, setBitacoraNueva] = useState('')
  const [guardandoBitacora, setGuardandoBitacora] = useState(false)
  const [verificadoEntrega, setVerificadoEntrega] = useState(false)
  const [fechaVerificacionEntrega, setFechaVerificacionEntrega] = useState(null)
  const [marcandoVerificacion, setMarcandoVerificacion] = useState(false)
  const [errorVerificacion, setErrorVerificacion] = useState('')
  const [ordenRegistrada, setOrdenRegistrada] = useState(() => repIdStrEsOrdenExistente(repIdStr))
  const [idReparacion, setIdReparacion] = useState(() => {
    if (!repIdStrEsOrdenExistente(repIdStr)) return null
    const n = Number(repIdStr)
    return Number.isFinite(n) && n > 0 ? n : null
  })
  const [clienteIdNum, setClienteIdNum] = useState(() => parseClienteIdFromSession(s))
  const [equipoIdSesion, setEquipoIdSesion] = useState(() => parseEquipoIdFromSession(s))

  const [dialogExito, setDialogExito] = useState(false)
  const [msgExito, setMsgExito] = useState('')

  const [confirmGuardarAbierto, setConfirmGuardarAbierto] = useState(false)
  const [confirmActualizarAbierto, setConfirmActualizarAbierto] = useState(false)
  const [alertaVerificarEntregaAbierto, setAlertaVerificarEntregaAbierto] = useState(false)
  const [alertaTransicionEstatusAbierto, setAlertaTransicionEstatusAbierto] = useState(false)
  const [mensajeTransicionEstatus, setMensajeTransicionEstatus] = useState('')
  const [eliminarConfirmAbierto, setEliminarConfirmAbierto] = useState(false)
  const [eliminandoOrden, setEliminandoOrden] = useState(false)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const guardandoRef = useRef(false)
  /** Evita que una recarga async pise el estatus elegido en el formulario. */
  const estatusDirtyRef = useRef(false)
  const estatusRef = useRef(estatus)
  estatusRef.current = estatus
  /** Estatus guardado en BD (validación de secuencia al actualizar). */
  const estatusPersistidoRef = useRef('INGRESADO')
  /** Evita doble INSERT si el usuario confirma dos veces antes de que React actualice `ordenRegistrada`. */
  const ordenRegistradaRef = useRef(repIdStrEsOrdenExistente(repIdStr))
  const [actualizandoOrden, setActualizandoOrden] = useState(false)
  const actualizandoRef = useRef(false)
  const [waMenuAbierto, setWaMenuAbierto] = useState(false)
  const [enviandoWa, setEnviandoWa] = useState(false)
  const [consultandoCuentaWa, setConsultandoCuentaWa] = useState(false)
  const [abriendoCuentaCliente, setAbriendoCuentaCliente] = useState(false)
  /** Evita reenviar el mismo tipo de mensaje WA en la misma sesión de orden. */
  const [waEnviados, setWaEnviados] = useState({ orden: false, anticipo: false, liquidacion: false })
  const [waExitoVisible, setWaExitoVisible] = useState(false)
  const waExitoTimerRef = useRef(null)
  /** Datos de cliente cargados por `cliente_id` cuando la sesión no trae nombre/teléfono. */
  const [clienteDesdeBd, setClienteDesdeBd] = useState(null)
  /** ISO de `fecha_creacion` de la reparación (mensaje WhatsApp y PDF). */
  const [fechaCreacionOrden, setFechaCreacionOrden] = useState(null)
  const [fechaIngresoOrden, setFechaIngresoOrden] = useState(null)
  const [fechaRevisionOrden, setFechaRevisionOrden] = useState(null)
  const [fechaReparadoOrden, setFechaReparadoOrden] = useState(null)
  const [fechaSinReparacionOrden, setFechaSinReparacionOrden] = useState(null)
  const [fechaEntregaOrden, setFechaEntregaOrden] = useState(null)
  const [cuentaOrden, setCuentaOrden] = useState(null)
  /** Cuentas del mismo cliente sin repara_id (requieren vinculación manual). */
  const [cuentasHuerfanasDetectadas, setCuentasHuerfanasDetectadas] = useState([])
  const [vinculandoCuentaId, setVinculandoCuentaId] = useState(null)
  const [ymdEntregaDesdePagos, setYmdEntregaDesdePagos] = useState(null)
  const [guardandoEstatus, setGuardandoEstatus] = useState(false)

  /** Refs sincronizados con fechas de hitos (evitan desfase al guardar justo tras cambiar estatus). */
  const fechaCreacionRef = useRef(null)
  const fechaIngresoRef = useRef(null)
  const fechaRevisionRef = useRef(null)
  const fechaReparadoRef = useRef(null)
  const fechaSinReparacionRef = useRef(null)
  const fechaEntregaRef = useRef(null)
  fechaCreacionRef.current = fechaCreacionOrden
  fechaIngresoRef.current = fechaIngresoOrden
  fechaRevisionRef.current = fechaRevisionOrden
  fechaReparadoRef.current = fechaReparadoOrden
  fechaSinReparacionRef.current = fechaSinReparacionOrden
  fechaEntregaRef.current = fechaEntregaOrden

  const esOrdenExistente = repIdStrEsOrdenExistente(repIdStr)

  const entradasBitacora = useMemo(() => parseBitacora(bitacora), [bitacora])

  const puedeEnviarPagoTotalWa = puedeEnviarPagoTotalWhatsApp(cuentaOrden, estatus)

  const puedeVerificarEntrega =
    (esOrdenExistente || idReparacion != null) &&
    estatusPermiteVerificacionEntrega(estatus) &&
    !verificadoEntrega

  const estatusOpcionesPermitidas = useMemo(
    () => estatusSiguientesPermitidos(estatus),
    [estatus],
  )

  const esGarantiaSinCobroActiva = useMemo(
    () => esGarantiaSinCobroTipo(tipoReparacion),
    [tipoReparacion],
  )

  const esGarantiaEpsonActiva = useMemo(
    () => esGarantiaEpsonTipo(tipoReparacion),
    [tipoReparacion],
  )

  function valorFolioEpsonGuardar() {
    if (!esGarantiaEpsonActiva) return null
    const t = String(folioEpson ?? '').trim()
    return t ? t.toUpperCase() : null
  }

  const aplicarVerificacionDesdeReparacion = useCallback((data) => {
    setVerificadoEntrega(estaVerificadoEntrega(data))
    setFechaVerificacionEntrega(data?.fecha_verificacion_entrega ?? null)
    setErrorVerificacion('')
  }, [])

  const fechasHitosBanner = useMemo(() => {
    const rep = {
      estatus,
      fecha_ingreso: ymdIngresoPreservar({
        fecha_ingreso: fechaIngresoOrden,
        fecha_creacion: fechaCreacionOrden,
      }),
      fecha_creacion: fechaCreacionOrden,
      fecha_revision: fechaRevisionOrden,
      fecha_reparado: fechaReparadoOrden,
      fecha_sin_reparacion: fechaSinReparacionOrden,
      fecha_entrega: fechaEntregaOrden,
    }
    return fechasHitosOrdenConVerificacion(rep, {
      cuentaVinculada: cuentaOrden,
      ymdDesdePagos: ymdEntregaDesdePagos,
      verificado: verificadoEntrega,
      fechaVerificacion: fechaVerificacionEntrega,
    })
  }, [
    estatus,
    fechaIngresoOrden,
    fechaCreacionOrden,
    fechaRevisionOrden,
    fechaReparadoOrden,
    fechaSinReparacionOrden,
    fechaEntregaOrden,
    cuentaOrden,
    ymdEntregaDesdePagos,
    verificadoEntrega,
    fechaVerificacionEntrega,
  ])

  const aplicarFechasDesdeReparacion = useCallback((data) => {
    const creacion = data.fecha_creacion ?? data.created_at ?? null
    const ingreso = ymdIngresoPreservar(data)
    const revision = aYmdLocalDesdeRaw(data.fecha_revision ?? data.fechaRevision ?? null)
    const reparado = aYmdLocalDesdeRaw(data.fecha_reparado ?? data.fechaReparado ?? null)
    const sinReparacion = aYmdLocalDesdeRaw(
      data.fecha_sin_reparacion ?? data.fechaSinReparacion ?? null,
    )
    const entrega = aYmdLocalDesdeRaw(
      data.fecha_entrega ?? data.fechaEntrega ?? data.fecha_entregada ?? null,
    )
    fechaCreacionRef.current = creacion
    fechaIngresoRef.current = ingreso
    fechaRevisionRef.current = revision
    fechaReparadoRef.current = reparado
    fechaSinReparacionRef.current = sinReparacion
    fechaEntregaRef.current = entrega
    setFechaCreacionOrden(creacion)
    setFechaIngresoOrden(ingreso)
    setFechaRevisionOrden(revision)
    setFechaReparadoOrden(reparado)
    setFechaSinReparacionOrden(sinReparacion)
    setFechaEntregaOrden(entrega)
  }, [])

  function repSnapshotParaFechas(estatusVal) {
    const snap = {
      estatus: estatusVal,
      fecha_creacion: fechaCreacionRef.current,
      created_at: fechaCreacionRef.current,
      fecha_ingreso: fechaIngresoRef.current,
      fecha_revision: fechaRevisionRef.current,
      fecha_reparado: fechaReparadoRef.current,
      fecha_sin_reparacion: fechaSinReparacionRef.current,
      fecha_entrega: fechaEntregaRef.current,
      verificado_entrega: verificadoEntrega,
      fecha_verificacion_entrega: fechaVerificacionEntrega,
    }
    if (!fechaIngresoFiltroYmd(snap)) {
      const hist = ymdIngresoPreservar(snap)
      if (hist) snap.fecha_ingreso = hist
    }
    return snap
  }

  function aplicarPatchFechasAlEstado(patchF, estatusVal) {
    if (patchF.fecha_ingreso != null) {
      fechaIngresoRef.current = patchF.fecha_ingreso
      setFechaIngresoOrden(patchF.fecha_ingreso)
    }
    if (patchF.fecha_revision != null) {
      fechaRevisionRef.current = patchF.fecha_revision
      setFechaRevisionOrden(patchF.fecha_revision)
    }
    if (patchF.fecha_reparado != null) {
      fechaReparadoRef.current = patchF.fecha_reparado
      setFechaReparadoOrden(patchF.fecha_reparado)
    }
    if (patchF.fecha_sin_reparacion != null) {
      fechaSinReparacionRef.current = patchF.fecha_sin_reparacion
      setFechaSinReparacionOrden(patchF.fecha_sin_reparacion)
    }
    if (estatusEsEntregado(estatusVal)) {
      const ent = patchF.fecha_entrega ?? ymdFechaEntregaParaGuardar(fechaEntregaRef.current)
      fechaEntregaRef.current = ent
      setFechaEntregaOrden(ent)
    } else {
      fechaEntregaRef.current = null
      setFechaEntregaOrden(null)
      setYmdEntregaDesdePagos(null)
    }
  }

  const obtenerCuentaDirectaOrden = useCallback(
    async (reparaId) => {
      if (reparaId == null || !Number.isFinite(Number(reparaId))) return null
      const rid = Number(reparaId)
      if (supabase) {
        const { data: cuentas, error } = await supabase.from('cuentas').select('*').eq('repara_id', rid)
        if (error) throw error
        return elegirCuentaMasReciente(cuentas ?? [])
      }
      const directas = readLs(LS_CUENTAS, []).filter((c) => sameId(c.repara_id ?? c.reparacion_id, rid))
      return elegirCuentaMasReciente(directas)
    },
    [supabase],
  )

  const listarCuentasHuerfanasParaOrden = useCallback(
    async (reparaId) => {
      if (reparaId == null || !Number.isFinite(Number(reparaId))) return []
      const rid = Number(reparaId)
      if (supabase) {
        const { data: rep, error: eRep } = await supabase
          .from('reparaciones')
          .select('cliente_id, fecha_creacion, created_at')
          .eq('id', rid)
          .maybeSingle()
        if (eRep) throw eRep
        const cid = rep?.cliente_id
        if (cid == null) return []

        const { data: huerfanas, error: eH } = await supabase
          .from('cuentas')
          .select('*')
          .eq('cliente_id', cid)
          .is('repara_id', null)
          .order('created_at', { ascending: false })
        if (eH) throw eH
        const lista = huerfanas ?? []
        if (!lista.length) return []

        const tOrden = new Date(rep.fecha_creacion ?? rep.created_at ?? 0).getTime()
        if (!Number.isFinite(tOrden) || tOrden <= 0) return lista
        return [...lista].sort((a, b) => {
          const da = Math.abs(new Date(a.created_at ?? 0).getTime() - tOrden)
          const db = Math.abs(new Date(b.created_at ?? 0).getTime() - tOrden)
          return da - db
        })
      }

      const rep = readLs(LS_REP, []).find((r) => sameId(r.id, rid))
      const cid = rep?.cliente_id
      if (cid == null) return []
      return readLs(LS_CUENTAS, []).filter(
        (c) => sameId(c.cliente_id, cid) && (c.repara_id == null || c.reparacion_id == null),
      )
    },
    [supabase],
  )

  const cargarCuentaYEntregaAux = useCallback(
    async (reparaId) => {
      if (reparaId == null || !Number.isFinite(Number(reparaId))) {
        setCuentaOrden(null)
        setCuentasHuerfanasDetectadas([])
        setYmdEntregaDesdePagos(null)
        return
      }
      const rid = Number(reparaId)
      try {
        const cuenta = await obtenerCuentaDirectaOrden(rid)
        setCuentaOrden(cuenta)
        if (!cuenta?.id) {
          const huerfanas = await listarCuentasHuerfanasParaOrden(rid)
          setCuentasHuerfanasDetectadas(huerfanas)
          setYmdEntregaDesdePagos(null)
          return
        }
        setCuentasHuerfanasDetectadas([])
        if (supabase) {
          const { data: pagos, error: eP } = await supabase
            .from('pagosclientes')
            .select('*')
            .eq('cuenta_id', cuenta.id)
          if (eP) throw eP
          let ymd = null
          for (const p of pagos ?? []) {
            const y = aYmdLocalDesdeRaw(p?.created_at ?? p?.fecha ?? p?.fecha_pago)
            if (y && (!ymd || y > ymd)) ymd = y
          }
          setYmdEntregaDesdePagos(ymd)
        } else {
          const pagos = readLs(LS_PAGOS, []).filter((p) => sameId(p.cuenta_id, cuenta.id))
          let ymd = null
          for (const p of pagos) {
            const y = aYmdLocalDesdeRaw(p?.created_at ?? p?.fecha ?? p?.fecha_pago)
            if (y && (!ymd || y > ymd)) ymd = y
          }
          setYmdEntregaDesdePagos(ymd)
        }
      } catch (e) {
        console.warn('No se cargaron datos de entrega para la orden:', e.message)
        setCuentaOrden(null)
        setCuentasHuerfanasDetectadas([])
        setYmdEntregaDesdePagos(null)
      }
    },
    [supabase, obtenerCuentaDirectaOrden, listarCuentasHuerfanasParaOrden],
  )

  const cargarReparacion = useCallback(async (idOverride) => {
    const id =
      idOverride != null && Number.isFinite(Number(idOverride))
        ? Number(idOverride)
        : repIdStrEsOrdenExistente(repIdStr)
          ? Number(repIdStr)
          : null
    if (id == null || !Number.isFinite(id)) return
    try {
      if (supabase) {
        let { data, error } = await supabase.from('reparaciones').select('*').eq('id', id).maybeSingle()
        if (error) throw error
        if (!data) {
          onError(`No se encontró la orden #${id} en la base de datos.`)
          return
        }
        data = await persistirFechasHitosFaltantesSupabase(supabase, data)
        setNumeroOrden(String(data.id))
        setTipoReparacion(data.tipo_reparacion ?? '')
        setFolioEpson(data.folio_epson ?? '')
        if (!estatusDirtyRef.current) {
          setEstatus(data.estatus ?? 'INGRESADO')
          estatusPersistidoRef.current = data.estatus ?? 'INGRESADO'
        }
        setDescripcionEquipo(data.descripcion_equipo ?? '')
        setProblemasReportados(data.problemas_reportados ?? '')
        setDescripcionSolucion(data.descripcion_solucion ?? '')
        setBitacora(data.bitacora ?? '')
        aplicarVerificacionDesdeReparacion(data)
        aplicarFechasDesdeReparacion(data)
        const [t1, t2] = separarTecnicos(data.tecnico)
        setTecnico1(t1)
        setTecnico2(t2)
        setIdReparacion(data.id)
        setOrdenRegistrada(true)
        ordenRegistradaRef.current = true
        setClienteIdNum(data.cliente_id ?? null)
        const nv = parseNiveles(data.niveles_tinta)
        setNivelB(nv.b)
        setNivelY(nv.y)
        setNivelM(nv.m)
        setNivelC(nv.c)
        setNivelMlight(nv.mL)
        setNivelClight(nv.cL)
        await cargarCuentaYEntregaAux(data.id)
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
        if (!data) {
          onError(`No se encontró la orden #${id} en la base de datos.`)
          return
        }
        setNumeroOrden(String(data.id))
        setTipoReparacion(data.tipo_reparacion ?? '')
        setFolioEpson(data.folio_epson ?? '')
        if (!estatusDirtyRef.current) {
          setEstatus(data.estatus ?? 'INGRESADO')
          estatusPersistidoRef.current = data.estatus ?? 'INGRESADO'
        }
        setDescripcionEquipo(data.descripcion_equipo ?? '')
        setProblemasReportados(data.problemas_reportados ?? '')
        setDescripcionSolucion(data.descripcion_solucion ?? '')
        setBitacora(data.bitacora ?? '')
        aplicarVerificacionDesdeReparacion(data)
        aplicarFechasDesdeReparacion(data)
        const [t1, t2] = separarTecnicos(data.tecnico)
        setTecnico1(t1)
        setTecnico2(t2)
        setIdReparacion(data.id)
        setOrdenRegistrada(true)
        ordenRegistradaRef.current = true
        setClienteIdNum(data.cliente_id ?? null)
        const nv = parseNiveles(data.niveles_tinta)
        setNivelB(nv.b)
        setNivelY(nv.y)
        setNivelM(nv.m)
        setNivelC(nv.c)
        setNivelMlight(nv.mL)
        setNivelClight(nv.cL)
        await cargarCuentaYEntregaAux(data.id)
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
  }, [repIdStr, supabase, onError, aplicarFechasDesdeReparacion, aplicarVerificacionDesdeReparacion, cargarCuentaYEntregaAux])

  const cargarReparacionRef = useRef(cargarReparacion)
  cargarReparacionRef.current = cargarReparacion

  useEffect(() => {
    estatusDirtyRef.current = false
    estatusPersistidoRef.current = 'INGRESADO'
    if (repIdStrEsOrdenExistente(repIdStr)) {
      void cargarReparacionRef.current()
      return
    }
    const reciente = leerOrdenRecienCreadaEnSesion()
    if (reciente) {
      ordenRegistradaRef.current = true
      void cargarReparacionRef.current(reciente)
    }
    // Solo al cambiar de orden (repIdStr); no recargar en cada re-render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repIdStr])

  /** Al volver de Cuentas, recargar orden (p. ej. bitácora tras notificar al cliente). */
  useEffect(() => {
    if (!s._recargarOrden) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (id != null) void cargarReparacionRef.current(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s._recargarOrden])

  useEffect(() => {
    setWaEnviados({ orden: false, anticipo: false, liquidacion: false })
    setWaExitoVisible(false)
    if (waExitoTimerRef.current) {
      clearTimeout(waExitoTimerRef.current)
      waExitoTimerRef.current = null
    }
  }, [repIdStr, idReparacion])

  useEffect(() => {
    let cancelado = false
    void cargarTecnicosUnificados(supabase).then((lista) => {
      if (!cancelado) setTecnicosCatalogo(lista)
    })
    return () => {
      cancelado = true
    }
  }, [supabase])

  useEffect(
    () => () => {
      if (waExitoTimerRef.current) clearTimeout(waExitoTimerRef.current)
    },
    [],
  )

  function mostrarExitoWhatsApp(tipo) {
    setWaEnviados((prev) => ({ ...prev, [tipo]: true }))
    setWaExitoVisible(true)
    if (waExitoTimerRef.current) clearTimeout(waExitoTimerRef.current)
    waExitoTimerRef.current = setTimeout(() => {
      setWaExitoVisible(false)
      setWaMenuAbierto(false)
      waExitoTimerRef.current = null
    }, 2600)
  }

  async function buscarOrdenRecienteMismaSesion(cid, eid, problemas, tipoRep) {
    const prob = String(problemas ?? '').trim()
    const tipo = String(tipoRep ?? '').trim()
    const since = new Date(Date.now() - 120_000).toISOString()
    const coincide = (r) =>
      !esOrdenDuplicada(r) &&
      String(r.problemas_reportados ?? '').trim() === prob &&
      String(r.tipo_reparacion ?? '').trim() === tipo

    if (supabase) {
      const { data, error } = await supabase
        .from('reparaciones')
        .select('id, problemas_reportados, tipo_reparacion')
        .eq('cliente_id', cid)
        .eq('equipo_id', eid)
        .gte('fecha_creacion', since)
        .order('id', { ascending: false })
        .limit(8)
      if (error) throw error
      const hit = (data ?? []).find(coincide)
      return hit?.id ?? null
    }
    const all = readLs(LS_REP, [])
    const hit = all
      .filter(
        (r) =>
          Number(r.cliente_id) === Number(cid) &&
          Number(r.equipo_id) === Number(eid) &&
          String(r.fecha_creacion ?? r.created_at ?? '') >= since,
      )
      .sort((a, b) => Number(b.id) - Number(a.id))
      .find(coincide)
    return hit?.id ?? null
  }

  async function resolverClienteId() {
    if (clienteIdNum != null) return clienteIdNum
    if (clienteDesdeBd?.id != null) {
      setClienteIdNum(clienteDesdeBd.id)
      return clienteDesdeBd.id
    }
    const sid = parseClienteIdFromSession(s)
    if (sid != null) {
      setClienteIdNum(sid)
      return sid
    }
    const nom = (s.clienteNombre ?? clienteDesdeBd?.nombre ?? '').trim()
    const tel = (s.clienteTelefono ?? clienteDesdeBd?.telefono ?? '').trim()
    const telDig = soloDigitosTel(tel)
    if (!nom || !tel) return null
    const coincideTel = (x) =>
      String(x.telefono) === tel || (telDig.length > 0 && soloDigitosTel(x.telefono) === telDig)
    if (supabase) {
      const { data, error } = await supabase.from('clientes').select('*')
      if (error) throw error
      const c = (data ?? [])
        .map(normalizeClienteRow)
        .find((x) => x.nombre.toLowerCase() === nom.toLowerCase() && coincideTel(x))
      if (c?.id != null) {
        setClienteIdNum(c.id)
        return c.id
      }
    } else {
      const c = readLs(LS_CLIENTES, [])
        .map(normalizeClienteRow)
        .find((x) => x.nombre.toLowerCase() === nom.toLowerCase() && coincideTel(x))
      if (c?.id != null) {
        setClienteIdNum(c.id)
        return c.id
      }
    }
    return null
  }

  async function resolverEquipoId() {
    const { id, error } = await sincronizarEquipoParaOrden(supabase, {
      equipoId: equipoIdSesion,
      serie: serieEquipo,
      tipo_equipo: tipoEquipo,
      descripcion: descripcionEquipo,
      tipo_reparacion: tipoReparacion,
      readLs,
      writeLs,
      LS_EQUIPOS,
    })
    if (error) throw new Error(error)
    if (id != null) setEquipoIdSesion(id)
    return id
  }

  const crearCuentaVinculadaOrden = useCallback(
    async (reparaId, clienteId) => {
      if (reparaId == null || clienteId == null) return null
      const rid = Number(reparaId)
      const cid = Number(clienteId)
      if (!Number.isFinite(rid) || !Number.isFinite(cid)) return null
      const now = new Date().toISOString()
      const row = {
        cliente_id: cid,
        total: 0,
        saldo: 0,
        estatus: 'PENDIENTE',
        created_at: now,
        fecha_liquidada: null,
        repara_id: rid,
        tipo_pago: null,
      }
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').insert(row).select('*').single()
        if (error) {
          if (esViolacionUnica(error)) return obtenerCuentaDirectaOrden(rid)
          throw error
        }
        return data
      }
      const nuevo = { id: nextLocalId(), ...row }
      writeLs(LS_CUENTAS, [nuevo, ...readLs(LS_CUENTAS, [])])
      return nuevo
    },
    [supabase, obtenerCuentaDirectaOrden],
  )

  async function vincularCuentaHuerfanaAOrden(cuentaId) {
    const rid = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!rid) {
      onError?.('Primero registre o cargue la orden de servicio.')
      return
    }
    if (cuentaId == null) return
    setVinculandoCuentaId(cuentaId)
    try {
      let vinculada
      if (supabase) {
        vinculada = await vincularCuentaAOrdenSupabase(supabase, cuentaId, rid)
      } else {
        const list = readLs(LS_CUENTAS, [])
        const idx = list.findIndex((c) => sameId(c.id, cuentaId))
        if (idx < 0) throw new Error(`No se encontró la cuenta #${cuentaId}.`)
        vinculada = { ...list[idx], repara_id: rid }
        writeLs(
          LS_CUENTAS,
          list.map((c) => (sameId(c.id, cuentaId) ? vinculada : c)),
        )
      }
      setCuentaOrden(vinculada)
      setCuentasHuerfanasDetectadas([])
      await cargarCuentaYEntregaAux(rid)
      onNotice?.(`Cuenta #${cuentaId} vinculada a la orden #${rid}.`)
    } catch (e) {
      onError?.(`No se pudo vincular la cuenta: ${e.message}`)
    } finally {
      setVinculandoCuentaId(null)
    }
  }

  async function cargarClientePorId(cid) {
    if (cid == null) return null
    if (supabase) {
      const { data: cx, error } = await supabase.from('clientes').select('*').eq('id', cid).maybeSingle()
      if (error) throw error
      return cx ? normalizeClienteRow(cx) : null
    }
    const cl = readLs(LS_CLIENTES, []).find((c) => sameId(c.id, cid))
    return cl ? normalizeClienteRow(cl) : null
  }

  async function resolverClienteParaIrCuenta(cuenta) {
    let cid =
      clienteDesdeBd?.id ??
      clienteIdNum ??
      parseClienteIdFromSession(s) ??
      cuenta?.cliente_id ??
      null
    if (cid == null) {
      const rid = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
      if (rid != null) {
        if (supabase) {
          const { data: rep, error } = await supabase
            .from('reparaciones')
            .select('cliente_id')
            .eq('id', rid)
            .maybeSingle()
          if (error) throw error
          cid = rep?.cliente_id ?? null
        } else {
          const rep = readLs(LS_REP, []).find((r) => sameId(r.id, rid))
          cid = rep?.cliente_id ?? null
        }
      }
    }
    if (cid == null) {
      cid = await resolverClienteId()
    }
    if (cid == null) return null

    let row = null
    if (clienteDesdeBd?.id != null && sameId(clienteDesdeBd.id, cid)) {
      row = clienteDesdeBd
    } else {
      row = await cargarClientePorId(cid)
      if (row?.id != null) {
        setClienteDesdeBd(row)
        setClienteIdNum(row.id)
      }
    }

    if (row?.id != null) {
      return normalizeClienteRow({
        ...row,
        nombre: row.nombre || clienteDesdeBd?.nombre || s.clienteNombre || '',
        telefono: row.telefono || clienteDesdeBd?.telefono || s.clienteTelefono || '',
        domicilio: row.domicilio || clienteDesdeBd?.domicilio || s.clienteDomicilio || '',
        correo: row.correo || clienteDesdeBd?.correo || s.clienteCorreo || '',
      })
    }

    const nom = (clienteDesdeBd?.nombre || s.clienteNombre || '').trim()
    const tel = (clienteDesdeBd?.telefono || s.clienteTelefono || '').trim()
    if (nom || tel) {
      return normalizeClienteRow({
        id: cid,
        nombre: nom,
        telefono: tel,
        domicilio: clienteDesdeBd?.domicilio || s.clienteDomicilio || '',
        correo: clienteDesdeBd?.correo || s.clienteCorreo || '',
      })
    }
    return null
  }

  /**
   * Registra una orden nueva. Devuelve true solo si reparación + cuenta quedaron creadas.
   * Una sola inserción a la vez (mutex global + bloqueo entre pestañas).
   */
  function insertarReparacion() {
    if (ordenRegistradaRef.current || ordenRegistrada) return Promise.resolve(false)
    return ejecutarInsercionOrdenUnica(() => insertarReparacionCore())
  }

  async function insertarReparacionCore() {
    if (guardandoRef.current || ordenRegistradaRef.current || ordenRegistrada) return false

    const recienteSesion = leerOrdenRecienCreadaEnSesion()
    if (recienteSesion) {
      ordenRegistradaRef.current = true
      await cargarReparacion(recienteSesion)
      setOrdenRegistrada(true)
      setMsgExito(`La orden #${recienteSesion} ya fue registrada.`)
      setDialogExito(true)
      return true
    }

    if (!iniciarBloqueoInsercionPestana()) {
      onNotice?.('Ya se está registrando una orden en otra ventana. Espere un momento.')
      return false
    }

    guardandoRef.current = true
    setGuardandoOrden(true)
    let newId
    let existenteId = null
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
        setMsgExito(
          `No se encontró el equipo. Corrija la serie en el formulario o regístrelo en Equipos antes de crear la orden.`,
        )
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
        fecha_ingreso: ymdFechaEntregaParaGuardar(null),
        tipo_reparacion: tipoReparacion || null,
        folio_epson: valorFolioEpsonGuardar(),
        ...patchFechasHitosEstatus(estatus, {
          fecha_ingreso: ymdFechaEntregaParaGuardar(null),
          fecha_creacion: now,
        }, null),
      }

      existenteId = await buscarOrdenRecienteMismaSesion(cid, eid, problemasReportados, tipoReparacion)
      if (existenteId) {
        newId = existenteId
      } else if (supabase) {
        const ins = await insertarReparacionSupabase(supabase, row)
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
        saldo: 0,
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

      ordenRegistradaRef.current = true
      setIdReparacion(newId)
      setNumeroOrden(String(newId))
      setOrdenRegistrada(true)
      setClienteIdNum(cid)
      setFechaCreacionOrden(now)
      setFechaIngresoOrden(ymdFechaEntregaParaGuardar(null))
      estatusPersistidoRef.current = estatus
      registrarOrdenCreadaEnSesion(newId)
      const msgDuplicadoEvitado = existenteId
        ? `Ya existía la orden #${newId} con los mismos datos (se evitó un duplicado).`
        : `Se registró la orden de servicio con ID: ${newId}.`
      setMsgExito(msgDuplicadoEvitado)
      setDialogExito(true)
      onNotice(existenteId ? 'Orden existente recuperada' : 'Orden registrada')
      await cargarCuentaYEntregaAux(newId)
      return true
    } catch (e) {
      setMsgExito(`Error: ${e.message}`)
      setDialogExito(true)
      return false
    } finally {
      guardandoRef.current = false
      setGuardandoOrden(false)
      finalizarBloqueoInsercionPestana()
    }
  }

  function aplicarCambioEstatusLocal(v, patchPrecomputado = null) {
    estatusDirtyRef.current = true
    estatusRef.current = v
    setEstatus(v)
    const repActual = repSnapshotParaFechas(v)
    const patchF = patchPrecomputado ?? patchFechasHitosEstatus(v, repActual)
    aplicarPatchFechasAlEstado(patchF, v)
    if (!estatusListoParaVerificacionEntrega(v) && !estatusEsEntregado(v)) {
      setVerificadoEntrega(false)
      setFechaVerificacionEntrega(null)
    }
  }

  async function cambiarEstatusDesdeSelect(v) {
    if (!v) return
    const actual = estatusRef.current ?? estatus
    const val = validarTransicionEstatus(actual, v)
    if (!val.ok) {
      setMensajeTransicionEstatus(val.mensaje)
      setAlertaTransicionEstatusAbierto(true)
      onError?.(val.mensaje)
      return
    }
    if (estatusEsEntregado(v) && bloqueaEntregaSinVerificacion(actual, verificadoEntrega)) {
      setAlertaVerificarEntregaAbierto(true)
      onError?.(MENSAJE_VERIFICAR_ANTES_ENTREGADO)
      return
    }

    const repActual = repSnapshotParaFechas(actual)
    const patchEstatus = buildPatchCambioEstatusOrden(v, repActual, {
      verificadoEntrega,
      fechaVerificacionEntrega,
      estatusAnterior: actual,
    })
    aplicarCambioEstatusLocal(v, patchEstatus)

    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) return

    setGuardandoEstatus(true)
    try {
      if (supabase) {
        await persistirCambioEstatusOrdenSupabase(supabase, id, v, repActual, {
          verificadoEntrega,
          fechaVerificacionEntrega,
          estatusAnterior: actual,
        })
        const { data: guardada, error: eSel } = await supabase
          .from('reparaciones')
          .select(
            'fecha_entrega, fecha_ingreso, fecha_revision, fecha_reparado, fecha_sin_reparacion, fecha_creacion, created_at, estatus, verificado_entrega, fecha_verificacion_entrega',
          )
          .eq('id', id)
          .maybeSingle()
        if (eSel) throw eSel
        if (guardada) {
          aplicarFechasDesdeReparacion(guardada)
          aplicarVerificacionDesdeReparacion(guardada)
          estatusRef.current = guardada.estatus ?? v
          setEstatus(guardada.estatus ?? v)
        }
        if (estatusEsEntregado(v)) {
          await cargarCuentaYEntregaAux(id)
          try {
            await liquidarCuentaPagadaAlEntregarOrden(supabase, id)
          } catch (eLiq) {
            console.warn('No se pudo liquidar cuenta PAGADA al entregar:', eLiq.message)
          }
        }
      } else {
        const all = readLs(LS_REP, [])
        writeLs(
          LS_REP,
          all.map((r) => (r.id === id ? { ...r, ...patchEstatus } : r)),
        )
      }
      estatusPersistidoRef.current = v
      estatusRef.current = v
      estatusDirtyRef.current = false
      onNotice?.(`Estatus actualizado a ${v}.`)
    } catch (e) {
      onError?.(`No se pudo guardar el estatus: ${e.message}`)
    } finally {
      setGuardandoEstatus(false)
    }
  }

  async function marcarVerificadoEntrega() {
    const estatusActual = estatusRef.current ?? estatus
    setErrorVerificacion('')
    if (!estatusPermiteVerificacionEntrega(estatusActual)) {
      const msg =
        'Solo puede verificar equipos con estatus REPARADO o SIN REPARACION. Guarde la orden con uno de esos estatus e intente de nuevo.'
      setErrorVerificacion(msg)
      onError?.(msg)
      return
    }
    if (verificadoEntrega) {
      onNotice?.('Esta orden ya está verificada.')
      return
    }
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) {
      const msg = 'No hay número de orden cargado.'
      setErrorVerificacion(msg)
      onError?.(msg)
      return
    }
    setMarcandoVerificacion(true)
    const patchExtra = {}
    if (estatusDirtyRef.current && estatusPermiteVerificacionEntrega(estatusActual)) {
      patchExtra.estatus = estatusActual
    }
    try {
      if (supabase) {
        const repActual = {
          estatus: estatusActual,
          fecha_ingreso: fechaIngresoOrden,
          fecha_revision: fechaRevisionOrden,
          fecha_reparado: fechaReparadoOrden,
          fecha_sin_reparacion: fechaSinReparacionOrden,
          verificado_entrega: false,
          fecha_verificacion_entrega: null,
          fecha_entrega: fechaEntregaOrden,
          updated_at: new Date().toISOString(),
        }
        const guardada = await guardarVerificacionEntregaSupabase(
          supabase,
          id,
          true,
          patchExtra,
          repActual,
        )
        setVerificadoEntrega(true)
        setFechaVerificacionEntrega(guardada?.fecha_verificacion_entrega ?? null)
        aplicarFechasDesdeReparacion(guardada ?? repActual)
        if (patchExtra.estatus) {
          estatusDirtyRef.current = false
          setEstatus(guardada?.estatus ?? estatusActual)
        }
      } else {
        const repActual = {
          estatus: estatusActual,
          fecha_ingreso: fechaIngresoOrden,
          fecha_revision: fechaRevisionOrden,
          fecha_reparado: fechaReparadoOrden,
          fecha_sin_reparacion: fechaSinReparacionOrden,
          verificado_entrega: false,
          fecha_entrega: fechaEntregaOrden,
        }
        const verificadoPatch = patchVerificadoEntrega(true)
        const patch = {
          ...verificadoPatch,
          ...patchExtra,
          ...patchCompletarFechasHitosFaltantes({
            ...repActual,
            verificado_entrega: true,
            fecha_verificacion_entrega: verificadoPatch.fecha_verificacion_entrega,
          }),
        }
        const all = readLs(LS_REP, [])
        writeLs(
          LS_REP,
          all.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        )
        setVerificadoEntrega(true)
        setFechaVerificacionEntrega(patch.fecha_verificacion_entrega)
        aplicarFechasDesdeReparacion({ ...repActual, ...patch })
        if (patchExtra.estatus) {
          estatusDirtyRef.current = false
          setEstatus(patchExtra.estatus)
        }
      }
      onNotice?.('Equipo verificado. Ya puede marcar la orden como ENTREGADO.')
    } catch (e) {
      const msg = `No se pudo guardar la verificación: ${e.message}`
      setErrorVerificacion(msg)
      onError?.(msg)
    } finally {
      setMarcandoVerificacion(false)
    }
  }

  async function quitarVerificacionEntrega() {
    if (estatusEsEntregado(estatus)) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) return
    setErrorVerificacion('')
    setMarcandoVerificacion(true)
    try {
      if (supabase) {
        const guardada = await guardarVerificacionEntregaSupabase(supabase, id, false)
        setVerificadoEntrega(false)
        setFechaVerificacionEntrega(guardada?.fecha_verificacion_entrega ?? null)
      } else {
        const patch = patchVerificadoEntrega(false)
        const all = readLs(LS_REP, [])
        writeLs(
          LS_REP,
          all.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        )
        setVerificadoEntrega(false)
        setFechaVerificacionEntrega(null)
      }
      onNotice?.('Verificación de entrega quitada.')
    } catch (e) {
      const msg = `No se pudo quitar la verificación: ${e.message}`
      setErrorVerificacion(msg)
      onError?.(msg)
    } finally {
      setMarcandoVerificacion(false)
    }
  }

  async function agregarNotaBitacora() {
    const texto = bitacoraNueva.trim()
    if (!texto) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) {
      onError?.('No hay número de orden cargado.')
      return
    }
    const bitacoraActualizada = agregarEntradaBitacora(bitacora, texto)
    setGuardandoBitacora(true)
    const patch = { bitacora: bitacoraActualizada, updated_at: new Date().toISOString() }
    try {
      if (supabase) {
        await actualizarReparacionSupabase(supabase, id, patch)
      } else {
        const all = readLs(LS_REP, [])
        writeLs(
          LS_REP,
          all.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        )
      }
      setBitacora(bitacoraActualizada ?? '')
      setBitacoraNueva('')
      onNotice?.('Nota agregada a la bitácora.')
    } catch (e) {
      onError?.(`No se pudo guardar la bitácora: ${e.message}`)
    } finally {
      setGuardandoBitacora(false)
    }
  }

  function validarEstatusAntesDeGuardar(estatusGuardar) {
    const valTransicion = validarTransicionEstatusAlGuardar(
      estatusPersistidoRef.current,
      estatusGuardar,
    )
    if (!valTransicion.ok) {
      setMensajeTransicionEstatus(valTransicion.mensaje)
      setAlertaTransicionEstatusAbierto(true)
      onError?.(valTransicion.mensaje)
      return false
    }
    if (estatusEsEntregado(estatusGuardar) && !verificadoEntrega) {
      setAlertaVerificarEntregaAbierto(true)
      onError?.(MENSAJE_VERIFICAR_ANTES_ENTREGADO)
      return false
    }
    return true
  }

  function solicitarActualizarOrden() {
    if (actualizandoRef.current) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) {
      onError(
        'No hay número de orden cargado. Abra la orden desde Clientes, Equipos o el Monitor (✏️), o búsquela en «Orden de servicio».',
      )
      return
    }
    const estatusGuardar = String(estatusRef.current ?? estatus).trim() || 'INGRESADO'
    if (!validarEstatusAntesDeGuardar(estatusGuardar)) return
    setConfirmActualizarAbierto(true)
  }

  async function actualizarOrdenCore() {
    if (actualizandoRef.current) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) {
      onError(
        'No hay número de orden cargado. Abra la orden desde Clientes, Equipos o el Monitor (✏️), o búsquela en «Orden de servicio».',
      )
      return
    }
    actualizandoRef.current = true
    setActualizandoOrden(true)
    const estatusGuardar = String(estatusRef.current ?? estatus).trim() || 'INGRESADO'
    if (!validarEstatusAntesDeGuardar(estatusGuardar)) {
      actualizandoRef.current = false
      setActualizandoOrden(false)
      return
    }
    const niveles = combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight)
    const repActual = {
      fecha_ingreso: fechaIngresoRef.current,
      fecha_revision: fechaRevisionRef.current,
      fecha_reparado: fechaReparadoRef.current,
      fecha_sin_reparacion: fechaSinReparacionRef.current,
    }
    let bitacoraGuardar = bitacora.trim() ? bitacora : null
    if (bitacoraNueva.trim()) {
      bitacoraGuardar = agregarEntradaBitacora(bitacoraGuardar, bitacoraNueva)
      setBitacora(bitacoraGuardar ?? '')
      setBitacoraNueva('')
    }
    const repParaFechas = {
      ...repActual,
      estatus: estatusGuardar,
      fecha_creacion: fechaCreacionRef.current,
      verificado_entrega: verificadoEntrega || estatusEsEntregado(estatusGuardar),
      fecha_verificacion_entrega: fechaVerificacionEntrega,
      fecha_entrega: fechaEntregaRef.current,
    }
    const patchEstatusFechas = buildPatchCambioEstatusOrden(estatusGuardar, repParaFechas, {
      verificadoEntrega,
      fechaVerificacionEntrega,
      estatusAnterior: estatusPersistidoRef.current,
    })
    const patch = {
      ...patchEstatusFechas,
      tecnico: combinarTecnicos(tecnico1, tecnico2),
      descripcion_equipo: descripcionEquipo || null,
      problemas_reportados: problemasReportados || null,
      descripcion_solucion: descripcionSolucion ? descripcionSolucion.toUpperCase() : null,
      bitacora: bitacoraGuardar,
      tipo_reparacion: tipoReparacion || null,
      folio_epson: valorFolioEpsonGuardar(),
      niveles_tinta: niveles,
    }
    if (patch.fecha_entrega) {
      fechaEntregaRef.current = patch.fecha_entrega
      setFechaEntregaOrden(patch.fecha_entrega)
    } else if (!estatusEsEntregado(estatusGuardar)) {
      fechaEntregaRef.current = null
      setFechaEntregaOrden(null)
    }
    try {
      if (supabase) {
        await actualizarReparacionSupabase(supabase, id, patch)
        const { data: guardada, error: eVer } = await supabase
          .from('reparaciones')
          .select(
            'fecha_entrega, fecha_ingreso, fecha_revision, fecha_reparado, fecha_sin_reparacion, fecha_creacion, created_at, estatus, updated_at, verificado_entrega, fecha_verificacion_entrega',
          )
          .eq('id', id)
          .maybeSingle()
        if (!eVer && guardada) {
          aplicarFechasDesdeReparacion(guardada)
          aplicarVerificacionDesdeReparacion(guardada)
          if (
            estatusEsEntregado(estatusGuardar) &&
            !aYmdLocalDesdeRaw(guardada.fecha_entrega)
          ) {
            console.warn(
              `Orden #${id}: estatus ENTREGADO pero fecha_entrega no quedó en la base de datos.`,
            )
          }
        }
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

      estatusDirtyRef.current = false
      estatusPersistidoRef.current = estatusGuardar
      estatusRef.current = estatusGuardar
      setEstatus(estatusGuardar)
      if (patch.fecha_ingreso) {
        fechaIngresoRef.current = patch.fecha_ingreso
        setFechaIngresoOrden(patch.fecha_ingreso)
      }
      if (patch.fecha_revision) {
        fechaRevisionRef.current = patch.fecha_revision
        setFechaRevisionOrden(patch.fecha_revision)
      }
      if (patch.fecha_reparado) {
        fechaReparadoRef.current = patch.fecha_reparado
        setFechaReparadoOrden(patch.fecha_reparado)
      }
      if (patch.fecha_sin_reparacion) {
        fechaSinReparacionRef.current = patch.fecha_sin_reparacion
        setFechaSinReparacionOrden(patch.fecha_sin_reparacion)
      }
      await cargarCuentaYEntregaAux(id)
      if (estatusEsEntregado(estatusGuardar)) {
        if (supabase) {
          try {
            await liquidarCuentaPagadaAlEntregarOrden(supabase, id)
          } catch (eLiq) {
            console.warn('No se pudo liquidar cuenta PAGADA al entregar:', eLiq.message)
          }
        } else {
          const cuentas = readLs(LS_CUENTAS, []).filter((c) => sameId(c.repara_id, id))
          for (const c of cuentas) {
            if (String(c.estatus ?? '').toUpperCase() !== 'PAGADA') continue
            writeLs(
              LS_CUENTAS,
              readLs(LS_CUENTAS, []).map((x) =>
                sameId(x.id, c.id)
                  ? {
                      ...x,
                      saldo: 0,
                      estatus: 'LIQUIDADA',
                      fecha_liquidada: new Date().toISOString(),
                    }
                  : x,
              ),
            )
          }
        }
      }
      onNotice('Orden actualizada')
      setMsgExito('Cambios guardados.')
      setDialogExito(true)
      setConfirmActualizarAbierto(false)
    } catch (e) {
      onError(`Error al actualizar: ${e.message}`)
    } finally {
      actualizandoRef.current = false
      setActualizandoOrden(false)
    }
  }

  function renderResumenOrdenConfirmacion({ incluirNumeroOrden = false } = {}) {
    return (
      <div className="resumen-orden resumen-orden--confirmar">
        <div className="resumen-orden-grupo">
          <h4>👥 Cliente</h4>
          <p>
            <strong>Nombre:</strong> {nombreClienteUi || '—'}
          </p>
          <p>
            <strong>Teléfono:</strong> {telClienteUi || '—'}
          </p>
          {domClienteUi ? (
            <p>
              <strong>Domicilio:</strong> {domClienteUi}
            </p>
          ) : null}
          {correoClienteUi ? (
            <p>
              <strong>Correo:</strong> {correoClienteUi}
            </p>
          ) : null}
        </div>
        <div className="resumen-orden-grupo">
          <h4>🖨️ Equipo</h4>
          <p>
            <strong>Serie:</strong> {serieEquipo || '—'}
          </p>
          <p>
            <strong>Tipo:</strong> {tipoEquipo || '—'}
          </p>
          {descripcionEquipo ? (
            <p>
              <strong>Descripción:</strong> {descripcionEquipo}
            </p>
          ) : null}
          <p>
            <strong>Tipo de reparación:</strong> {tipoReparacion || '—'}
          </p>
          {esGarantiaEpsonActiva ? (
            <p>
              <strong>Folio:</strong> {folioEpson.trim() || '— (vacío)'}
            </p>
          ) : null}
        </div>
        <div className="resumen-orden-grupo">
          <h4>{incluirNumeroOrden ? `📋 Orden #${idReparacion ?? numeroOrden ?? '—'}` : '📋 Orden'}</h4>
          <p>
            <strong>Estatus:</strong> {estatus || '—'}
          </p>
          <p>
            <strong>Técnico(s):</strong> {combinarTecnicos(tecnico1, tecnico2) || '— (sin asignar)'}
          </p>
          <p>
            <strong>Problemas reportados:</strong> {problemasReportados || '— (vacío)'}
          </p>
          {descripcionSolucion ? (
            <p>
              <strong>Descripción de solución:</strong> {descripcionSolucion}
            </p>
          ) : null}
          <p>
            <strong>Niveles de tinta (B/Y/M/C/ML/CL):</strong>{' '}
            {combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight) || '— (sin definir)'}
          </p>
          {verificadoEntrega ? (
            <p>
              <strong>Verificado para entrega:</strong> Sí
            </p>
          ) : null}
          {bitacoraNueva.trim() ? (
            <p>
              <strong>Nota nueva en bitácora:</strong> {bitacoraNueva.trim()}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  async function eliminarOrden() {
    if (!puedeEliminar) {
      mostrarSinPermiso()
      setEliminarConfirmAbierto(false)
      return
    }
    if (eliminandoOrden) return
    const id = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!id) {
      onError('No hay orden para eliminar')
      return
    }
    setEliminandoOrden(true)
    try {
      await eliminarReparacionCompleta(supabase, id, {
        cuentas: LS_CUENTAS,
        pagos: LS_PAGOS,
        cuentamov: 'sistefix_local_cuentamov',
        reparamov: 'sistefix_local_reparamov',
        reparaciones: LS_REP,
      })
      setEliminarConfirmAbierto(false)
      onNotice(`Orden #${id} eliminada correctamente`)
      onSalir?.()
    } catch (e) {
      onError(`Error al eliminar orden: ${e.message}`)
    } finally {
      setEliminandoOrden(false)
    }
  }

  const nombreClienteUi = clienteDesdeBd?.nombre || s.clienteNombre || ''
  const telClienteUi = clienteDesdeBd?.telefono || s.clienteTelefono || ''
  const domClienteUi = clienteDesdeBd?.domicilio || s.clienteDomicilio || ''
  const correoClienteUi = clienteDesdeBd?.correo || s.clienteCorreo || ''
  const puedeAccionesPdf = ordenRegistrada || idReparacion != null
  const puedeIrCuentaCliente = Boolean(esOrdenExistente || idReparacion != null)

  async function irACuentaCliente() {
    if (!onIrCuentaCliente) {
      onError?.('No se puede abrir la cuenta desde aquí.')
      return
    }
    const rid = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!rid) {
      onError?.('Primero registre o cargue la orden de servicio.')
      return
    }
    setAbriendoCuentaCliente(true)
    try {
      let cuenta = cuentaOrden?.id ? cuentaOrden : null
      if (!cuenta?.id) {
        try {
          cuenta = await obtenerCuentaDirectaOrden(rid)
          if (cuenta) setCuentaOrden(cuenta)
        } catch (e) {
          onError?.(`No se pudo consultar la cuenta: ${e.message}`)
          return
        }
      }

      if (!cuenta?.id && cuentasHuerfanasDetectadas.length > 0) {
        onError?.(
          'Hay cuenta(s) del cliente sin vincular. Use el aviso «Vincular cuenta a orden de servicio» antes de continuar.',
        )
        return
      }

      let cliente
      try {
        cliente = await resolverClienteParaIrCuenta(cuenta)
      } catch (e) {
        onError?.(`No se pudo consultar el cliente: ${e.message}`)
        return
      }

      if (!cuenta?.id) {
        if (!cliente?.id) {
          onError?.('No se encontró el cliente de esta orden.')
          return
        }
        try {
          cuenta = await crearCuentaVinculadaOrden(rid, cliente.id)
          if (cuenta) setCuentaOrden(cuenta)
        } catch (e) {
          onError?.(`No se pudo crear la cuenta vinculada: ${e.message}`)
          return
        }
      }

      if (!cuenta?.id) {
        onError?.('Esta orden no tiene una cuenta vinculada.')
        return
      }

      if (!cliente?.id) {
        try {
          cliente = await resolverClienteParaIrCuenta(cuenta)
        } catch (e) {
          onError?.(`No se pudo consultar el cliente: ${e.message}`)
          return
        }
      }
      if (!cliente?.id) {
        onError?.('No se encontró el cliente de esta orden.')
        return
      }

      onIrCuentaCliente({
        cliente,
        cuenta: {
          ...cuentaParaVentas(cuenta),
          repara_id: cuenta.repara_id ?? rid,
        },
        reparacionOrdenId: rid,
      })
    } finally {
      setAbriendoCuentaCliente(false)
    }
  }

  async function imprimirEtiquetas() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || '—'
    const nombre = nombreClienteUi || '—'
    try {
      const { downloadEtiquetaPdf } = await import('./etiquetaPdf.js')
      downloadEtiquetaPdf({ nombre, orden: ord })
      onNotice('PDF de etiqueta descargado (2×1 in).')
    } catch (e) {
      onError(`No se pudo generar el PDF de la etiqueta: ${e?.message ?? e}`)
    }
  }

  async function enviarOrdenPdf() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || '—'
    const nt = combineNiveles(nivelB, nivelY, nivelC, nivelM, nivelClight, nivelMlight) ?? ''
    try {
      const { printOrdenServicioPdf, ORDEN_PRINT_HINT } = await import('./ordenServicioPdf.js')
      await printOrdenServicioPdf({
        orden: ord,
        fechaCreacion: fechaCreacionOrden,
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
          folioEpson: valorFolioEpsonGuardar(),
          estatus,
          tecnico: combinarTecnicos(tecnico1, tecnico2),
          problemas: problemasReportados,
          nivelesTinta: nt,
        },
        solucion: descripcionSolucion,
      })
      onNotice?.(ORDEN_PRINT_HINT)
    } catch (e) {
      onError(`No se pudo imprimir la orden: ${e?.message ?? e}`)
    }
  }

  async function obtenerCuentaOrdenConPagos() {
    const rid = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!rid) return { cuenta: null, pagos: [] }
    const cuenta = await obtenerCuentaDirectaOrden(rid)
    if (!cuenta?.id) return { cuenta: null, pagos: [] }
    if (supabase) {
      const { data: pagos, error: eP } = await supabase
        .from('pagosclientes')
        .select('*')
        .eq('cuenta_id', cuenta.id)
        .order('id', { ascending: false })
      if (eP) throw eP
      return { cuenta, pagos: pagos ?? [] }
    }
    const pagos = readLs(LS_PAGOS, []).filter((p) => Number(p.cuenta_id) === Number(cuenta.id))
    return { cuenta, pagos }
  }

  async function obtenerUltimoAnticipo() {
    const rid = resolveReparacionId(idReparacion, numeroOrden, repIdStr)
    if (!rid) return null
    if (supabase) {
      const { data: cuentas, error: eC } = await supabase
        .from('cuentas')
        .select('id')
        .eq('repara_id', rid)
        .order('id', { ascending: false })
        .limit(1)
      if (eC) throw eC
      const cuentaId = cuentas?.[0]?.id
      if (!cuentaId) return null
      const { data: pagos, error: eP } = await supabase
        .from('pagosclientes')
        .select('*')
        .eq('cuenta_id', cuentaId)
        .order('id', { ascending: false })
        .limit(1)
      if (eP) throw eP
      return pagos?.[0] ?? null
    }
    const matches = readLs(LS_CUENTAS, []).filter((c) => Number(c.repara_id) === Number(rid))
    const cuenta =
      matches.length === 0
        ? null
        : [...matches].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0]
    if (!cuenta?.id) return null
    const pagos = readLs(LS_PAGOS, []).filter((p) => Number(p.cuenta_id) === Number(cuenta.id))
    if (!pagos.length) return null
    return [...pagos].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0]
  }

  function reportarErrorTelefonoWa(wa) {
    if (wa.motivo === 'sin-telefono') {
      onError('El cliente no tiene un teléfono registrado.')
    } else if (wa.motivo === 'telefono-invalido') {
      onError(`El teléfono "${telClienteUi}" no tiene un formato válido para WhatsApp.`)
    } else if (wa.motivo === 'popup-bloqueado') {
      onError('El navegador bloqueó la ventana de WhatsApp. Permite ventanas emergentes e intenta de nuevo.')
    }
  }

  function telWaCloudApi() {
    if (!telClienteUi || !String(telClienteUi).trim()) {
      return { ok: false, errorMsg: 'El cliente no tiene un teléfono registrado.' }
    }
    return telefonoWaParaEnvio(telClienteUi)
  }

  function notificarResultadoWhatsApp(outcome, { manualOk }) {
    if (!outcome.ok) {
      onError(outcome.errorMsg)
      return outcome
    }
    if (outcome.modo === 'manual') {
      onNotice(`${outcome.aviso ?? 'Envío automático no disponible.'} ${manualOk}`)
    }
    return outcome
  }

  async function enviarWhatsAppOrdenCliente() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || ''
    if (!ord) {
      onError('Primero registra la orden de servicio para enviar el mensaje.')
      return { ok: false }
    }
    if (supabase) {
      const tel = telWaCloudApi()
      if (!tel.ok) {
        onError(tel.errorMsg)
        return { ok: false }
      }
      const res = await enviarOrdenWhatsAppCloudApi(supabase, {
        orden: ord,
        nombreCliente: nombreClienteUi,
        fecha: formatFechaOrdenMensaje(fechaCreacionOrden),
        descripcionEquipo,
        problemasReportados,
        to: tel.to,
      })
      return notificarResultadoWhatsApp(
        enviarWhatsAppConRespaldoManual(res, abrirWhatsAppOrden, {
          telefono: telClienteUi,
          numeroOrden: ord,
          negocio: 'SISTEBIT',
          fechaCreacion: fechaCreacionOrden,
          nombreCliente: nombreClienteUi,
          descripcionEquipo,
          problemasReportados,
          tipoEquipo,
          serieEquipo,
        }),
        {
          manualOk: 'Se abrió WhatsApp con el mensaje — pulse Enviar en la app.',
        },
      )
    }
    const wa = abrirWhatsAppOrden({
      telefono: telClienteUi,
      numeroOrden: ord,
      negocio: 'SISTEBIT',
      fechaCreacion: fechaCreacionOrden,
      nombreCliente: nombreClienteUi,
      descripcionEquipo,
      problemasReportados,
      tipoEquipo,
      serieEquipo,
    })
    if (wa.ok) {
      onNotice('Mensaje de orden listo en WhatsApp. Pulsa enviar en la app.')
      return { ok: true, modo: 'manual' }
    }
    reportarErrorTelefonoWa(wa)
    return { ok: false }
  }

  async function enviarWhatsAppAnticipoCliente() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || ''
    if (!ord) {
      onError('Primero registra la orden de servicio.')
      return { ok: false }
    }
    let ultimo
    try {
      ultimo = await obtenerUltimoAnticipo()
    } catch (e) {
      onError(`No se pudo consultar el anticipo: ${e.message}`)
      return { ok: false }
    }
    if (!ultimo) {
      onError('No hay anticipo registrado para esta orden. Regístrelo primero en Cuentas / Ventas.')
      return { ok: false }
    }
    const monto = formatMontoAnticipoWa(ultimo.pago)
    const forma = String(ultimo.forma_pago ?? '—')
    const fechaPago = formatFechaOrdenMensaje(ultimo.fecha_creacion ?? ultimo.created_at ?? new Date())

    if (supabase) {
      const tel = telWaCloudApi()
      if (!tel.ok) {
        onError(tel.errorMsg)
        return { ok: false }
      }
      const res = await enviarAnticipoWhatsAppCloudApi(supabase, {
        orden: ord,
        nombreCliente: nombreClienteUi,
        monto,
        formaPago: forma,
        fecha: fechaPago,
        to: tel.to,
      })
      return notificarResultadoWhatsApp(
        enviarWhatsAppConRespaldoManual(res, abrirWhatsAppAnticipo, {
          telefono: telClienteUi,
          numeroOrden: ord,
          negocio: 'SISTEBIT',
          nombreCliente: nombreClienteUi,
          monto,
          formaPago: forma,
          fecha: fechaPago,
        }),
        {
          manualOk: 'Se abrió WhatsApp con el mensaje — pulse Enviar en la app.',
        },
      )
    }
    const wa = abrirWhatsAppAnticipo({
      telefono: telClienteUi,
      numeroOrden: ord,
      negocio: 'SISTEBIT',
      nombreCliente: nombreClienteUi,
      monto,
      formaPago: forma,
      fecha: fechaPago,
    })
    if (wa.ok) {
      onNotice('Mensaje de anticipo listo en WhatsApp. Pulsa enviar en la app.')
      return { ok: true, modo: 'manual' }
    }
    reportarErrorTelefonoWa(wa)
    return { ok: false }
  }

  async function abrirMenuWhatsApp() {
    setWaExitoVisible(false)
    if (waExitoTimerRef.current) {
      clearTimeout(waExitoTimerRef.current)
      waExitoTimerRef.current = null
    }
    setWaMenuAbierto(true)
    setConsultandoCuentaWa(true)
    try {
      const { cuenta } = await obtenerCuentaOrdenConPagos()
      setCuentaOrden(cuenta ?? null)
    } catch {
      /* conservar cuentaOrden previa si falla la consulta */
    } finally {
      setConsultandoCuentaWa(false)
    }
  }

  async function enviarWhatsAppLiquidacionCliente() {
    const ord = idReparacion != null ? String(idReparacion) : numeroOrden || ''
    if (!ord) {
      onError('Primero registra la orden de servicio.')
      return { ok: false }
    }
    let cuenta
    let pagos
    try {
      ;({ cuenta, pagos } = await obtenerCuentaOrdenConPagos())
    } catch (e) {
      onError(`No se pudo consultar la cuenta: ${e.message}`)
      return { ok: false }
    }
    if (!cuenta) {
      onError('No hay cuenta vinculada a esta orden.')
      return { ok: false }
    }
    if (!puedeEnviarPagoTotalWhatsApp(cuenta, estatus)) {
      onError('Liquide la cuenta en Ventas o marque la orden como entregada antes de enviar este mensaje.')
      return { ok: false }
    }
    const totalNum = Number(cuenta.total ?? 0)
    const pagado = (pagos ?? []).reduce((s, p) => s + Number(p.pago ?? 0), 0)
    const montoBase = totalNum > 0.0001 ? totalNum : pagado
    if (montoBase <= 0.0001 && !estatusEsEntregado(estatus)) {
      onError('No hay monto de liquidación registrado en la cuenta.')
      return { ok: false }
    }
    const monto = formatMontoAnticipoWa(montoBase > 0.0001 ? montoBase : pagado)
    const forma = resumenFormasPagoWa(pagos)
    const fechaLiq = formatFechaOrdenMensaje(
      cuenta.fecha_liquidada ??
        cuenta.fechaLiquidada ??
        fechaEntregaOrden ??
        new Date(),
    )

    if (supabase) {
      const tel = telWaCloudApi()
      if (!tel.ok) {
        onError(tel.errorMsg)
        return { ok: false }
      }
      const res = await enviarLiquidacionWhatsAppCloudApi(supabase, {
        orden: ord,
        nombreCliente: nombreClienteUi,
        monto,
        formaPago: forma,
        fecha: fechaLiq,
        to: tel.to,
      })
      return notificarResultadoWhatsApp(
        enviarWhatsAppConRespaldoManual(res, abrirWhatsAppLiquidacion, {
          telefono: telClienteUi,
          numeroOrden: ord,
          negocio: 'SISTEBIT',
          nombreCliente: nombreClienteUi,
          monto,
          formaPago: forma,
          fecha: fechaLiq,
        }),
        {
          manualOk: 'Se abrió WhatsApp con el mensaje — pulse Enviar en la app.',
        },
      )
    }
    const wa = abrirWhatsAppLiquidacion({
      telefono: telClienteUi,
      numeroOrden: ord,
      negocio: 'SISTEBIT',
      nombreCliente: nombreClienteUi,
      monto,
      formaPago: forma,
      fecha: fechaLiq,
    })
    if (wa.ok) {
      onNotice('Mensaje de liquidación listo en WhatsApp. Pulsa enviar en la app.')
      return { ok: true, modo: 'manual' }
    }
    reportarErrorTelefonoWa(wa)
    return { ok: false }
  }

  async function elegirEnvioWhatsApp(tipo) {
    if (enviandoWa || waEnviados[tipo]) return
    if (tipo === 'liquidacion' && !puedeEnviarPagoTotalWa) return
    setEnviandoWa(true)
    try {
      let outcome
      if (tipo === 'orden') {
        outcome = await enviarWhatsAppOrdenCliente()
      } else if (tipo === 'anticipo') {
        outcome = await enviarWhatsAppAnticipoCliente()
      } else {
        outcome = await enviarWhatsAppLiquidacionCliente()
      }
      if (outcome?.ok && outcome.modo === 'cloud') {
        mostrarExitoWhatsApp(tipo)
        return
      }
      if (outcome?.ok) {
        setWaMenuAbierto(false)
      }
    } finally {
      setEnviandoWa(false)
    }
  }

  function cerrarMenuWhatsApp() {
    if (enviandoWa || waExitoVisible) return
    setWaMenuAbierto(false)
  }

  return (
    <div className="rep-root">
      <AlertaPermiso mensaje={alertaPermiso} />
      {!omitOuterHeader ? (
        <header className="rep-header-bar">
          <h1>Reparaciones</h1>
        </header>
      ) : null}

      <div className="rep-scroll">
        {fechasHitosBanner.length > 0 ? (
          <div className="rep-orden-fechas-hitos-banner" role="status" aria-live="polite">
            {fechasHitosBanner.map((h) => (
              <span key={h.clave} className="rep-orden-fecha-hito">
                {h.etiqueta}: <strong>{h.texto}</strong>
              </span>
            ))}
          </div>
        ) : null}
        <div className="rep-block highlight">
          <label>No de Orden</label>
          <div className="rep-orden-numero-row">
            <input
              value={numeroOrden}
              onChange={(e) => setNumeroOrden(e.target.value)}
              placeholder="No de Orden"
              readOnly={ordenRegistrada}
              aria-describedby={ordenRegistrada && fechaCreacionOrden ? 'rep-orden-fecha-creada' : undefined}
            />
            {(ordenRegistrada || idReparacion != null) && numeroOrden ? (
              <span id="rep-orden-fecha-creada" className="rep-orden-fecha-creada" title="Fecha de creación de la orden">
                {fechaCreacionOrden ? `· ${formatFechaOrdenMensaje(fechaCreacionOrden)}` : '—'}
              </span>
            ) : null}
          </div>
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

        <div
          className={`rep-block rep-garantia-sin-cobro-block${esGarantiaSinCobroActiva ? ' rep-garantia-sin-cobro-block--activa' : ''}`}
        >
          <label htmlFor="rep-tipo-servicio">Tipo de servicio</label>
          <select
            id="rep-tipo-servicio"
            className="rep-tipo-servicio-select"
            value={tipoReparacion}
            onChange={(e) => {
              const v = e.target.value
              setTipoReparacion(v)
              if (!esGarantiaEpsonTipo(v)) setFolioEpson('')
            }}
            aria-label="Tipo de servicio"
          >
            <option value="">Seleccionar tipo de servicio</option>
            {TIPOS_REPARACION.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {esGarantiaSinCobroActiva ? (
            <p className="rep-garantia-sin-cobro-aviso muted small" role="status">
              <strong>{etiquetaGarantiaSinCobro(tipoReparacion)}</strong> — sin cobro al cliente. Al registrar la
              orden se crea su cuenta; al liquidarla en Cuentas (incluso en <strong>$0.00</strong>) la orden pasa a{' '}
              <strong>ENTREGADO</strong> automáticamente.
            </p>
          ) : null}
        </div>

        {esGarantiaEpsonActiva ? (
          <div className="rep-block rep-folio-epson-block highlight">
            <label htmlFor="rep-folio-epson">Folio</label>
            <input
              id="rep-folio-epson"
              type="text"
              value={folioEpson}
              onChange={(e) => setFolioEpson(e.target.value.toUpperCase())}
              placeholder="Folio de garantía Epson"
              autoComplete="off"
            />
          </div>
        ) : null}

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
            <select
              className="estatus-select"
              value=""
              disabled={guardandoEstatus || estatusOpcionesPermitidas.length === 0}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                void cambiarEstatusDesdeSelect(v)
                e.target.value = ''
              }}
            >
              <option value="">
                {guardandoEstatus
                  ? 'Guardando estatus…'
                  : estatusOpcionesPermitidas.length === 0
                    ? 'Sin cambios disponibles'
                    : 'Seleccionar siguiente estatus'}
              </option>
              {estatusOpcionesPermitidas.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(esOrdenExistente || idReparacion != null) && !estatusEsEntregado(estatus) ? (
          <div
            className={`rep-verificacion-entrega${verificadoEntrega ? ' rep-verificacion-entrega--ok' : ''}`}
            role="status"
            aria-live="polite"
          >
            {verificadoEntrega ? (
              <>
                <p className="rep-verificacion-entrega-msg">
                  ✓ Equipo verificado — listo para entrega al cliente
                  {fechaVerificacionEntrega
                    ? ` · ${formatFechaLegibleEsMx(fechaVerificacionEntrega, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}
                </p>
                {estatusPermiteVerificacionEntrega(estatus) ? (
                  <button
                    type="button"
                    className="secondary rep-verificacion-entrega-quitar"
                    disabled={marcandoVerificacion}
                    onClick={() => void quitarVerificacionEntrega()}
                  >
                    Quitar verificación
                  </button>
                ) : null}
              </>
            ) : estatusPermiteVerificacionEntrega(estatus) ? (
              <>
                <p className="rep-verificacion-entrega-ayuda muted small">
                  {estatusEsSinReparacion(estatus) ? (
                    <>
                      La orden está en <strong>SIN REPARACION</strong>. Confirme que el equipo puede
                      entregarse así; al verificar, quedará listo para marcar ENTREGADO.
                    </>
                  ) : (
                    <>
                      El equipo ya está <strong>REPARADO</strong>. Revíselo una vez más antes de entregarlo al
                      cliente; al verificar, quedará listo para marcar ENTREGADO.
                    </>
                  )}
                </p>
                {errorVerificacion ? (
                  <p className="rep-verificacion-entrega-error error" role="alert">
                    {errorVerificacion}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn-verificar-entrega wide"
                  disabled={marcandoVerificacion}
                  onClick={() => void marcarVerificadoEntrega()}
                >
                  {marcandoVerificacion ? 'Guardando…' : '✓ Verificar listo para entrega'}
                </button>
              </>
            ) : (
              <p className="rep-verificacion-entrega-pendiente muted small">
                Cuando el estatus sea <strong>REPARADO</strong> o <strong>SIN REPARACION</strong>, podrá
                verificar el equipo antes de marcarlo ENTREGADO.
              </p>
            )}
          </div>
        ) : null}

        {(esOrdenExistente || idReparacion != null) && estatusEsEntregado(estatus) && verificadoEntrega ? (
          <div className="rep-verificacion-entrega rep-verificacion-entrega--ok" role="status">
            <p className="rep-verificacion-entrega-msg">
              ✓ Equipo verificado antes de la entrega
              {fechaVerificacionEntrega
                ? ` · ${formatFechaLegibleEsMx(fechaVerificacionEntrega, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </p>
          </div>
        ) : null}

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

        {(esOrdenExistente || idReparacion != null) && (
          <div className="rep-block rep-block--bitacora">
            <label>Bitácora</label>
            <div className="rep-bitacora-panel">
              {entradasBitacora.length > 0 ? (
                <ul className="rep-bitacora-lista">
                  {entradasBitacora.map((entrada, idx) => (
                    <li key={`${entrada.fecha ?? 's'}-${idx}`} className="rep-bitacora-entrada">
                      <span className="rep-bitacora-fecha">{formatFechaBitacora(entrada.fecha)}</span>
                      <span className="rep-bitacora-texto">{entrada.texto}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rep-bitacora-vacia">Sin notas registradas.</p>
              )}
              <div className="rep-bitacora-nueva">
                <textarea
                  rows={2}
                  value={bitacoraNueva}
                  disabled={guardandoBitacora}
                  onChange={(e) => setBitacoraNueva(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      void agregarNotaBitacora()
                    }
                  }}
                  placeholder="Escriba una nota de seguimiento…"
                />
                <button
                  type="button"
                  className="btn-secondary rep-bitacora-agregar"
                  disabled={guardandoBitacora || !bitacoraNueva.trim()}
                  onClick={() => void agregarNotaBitacora()}
                >
                  {guardandoBitacora ? 'Guardando…' : '📝 Agregar nota'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="rep-cliente-card">
          <strong>Cliente</strong>
          <span>{nombreClienteUi || '—'}</span>
          <span>Tel: {telClienteUi || '—'}</span>
          {domClienteUi ? <span>Dir: {domClienteUi}</span> : null}
          {correoClienteUi ? <span>Email: {correoClienteUi}</span> : null}
          {esGarantiaEpsonActiva ? (
            <span>Folio Epson: {folioEpson.trim() || '—'}</span>
          ) : null}
        </div>

        {!cuentaOrden?.id && cuentasHuerfanasDetectadas.length > 0 && (esOrdenExistente || idReparacion != null) ? (
          <div className="rep-aviso-vincular-cuenta" role="alert">
            <p className="rep-aviso-vincular-cuenta-titulo">
              <strong>Vincular cuenta a orden de servicio</strong>
            </p>
            <p className="rep-aviso-vincular-cuenta-texto">
              La orden #{idReparacion ?? numeroOrden ?? repIdStr} no tiene cuenta vinculada. Este cliente tiene{' '}
              {cuentasHuerfanasDetectadas.length === 1 ? 'una cuenta' : `${cuentasHuerfanasDetectadas.length} cuentas`}{' '}
              sin orden asignada:
            </p>
            <ul className="rep-aviso-vincular-cuenta-lista">
              {cuentasHuerfanasDetectadas.map((c) => {
                const ymd = aYmdLocalDesdeRaw(c.created_at)
                const fechaTxt = ymd ? formatFechaLegibleEsMx(ymd) : '—'
                return (
                  <li key={c.id} className="rep-aviso-vincular-cuenta-item">
                    <span>
                      Cuenta <strong>#{c.id}</strong> · {formatMontoCuenta(c.total ?? 0)} · {String(c.estatus ?? '—')} ·{' '}
                      {fechaTxt}
                    </span>
                    <button
                      type="button"
                      className="btn-vincular-cuenta-orden"
                      disabled={vinculandoCuentaId != null}
                      onClick={() => void vincularCuentaHuerfanaAOrden(c.id)}
                    >
                      {vinculandoCuentaId === c.id
                        ? 'Vinculando…'
                        : `Vincular a orden #${idReparacion ?? numeroOrden ?? repIdStr}`}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="rep-actions">
          <button
            type="button"
            className="btn-primary wide"
            disabled={ordenRegistrada || guardandoOrden}
            onClick={() => {
              if (guardandoOrden || ordenRegistrada) return
              setConfirmGuardarAbierto(true)
            }}
          >
            {ordenRegistrada ? '✅ Orden registrada' : '📝 Registrar orden'}
          </button>
          {(esOrdenExistente || idReparacion != null) && (
            <button
              type="button"
              className="btn-secondary wide btn-actualizar-orden"
              disabled={actualizandoOrden}
              onClick={() => solicitarActualizarOrden()}
            >
              {actualizandoOrden ? 'Guardando…' : '💾 Actualizar orden'}
            </button>
          )}
          {(esOrdenExistente || idReparacion != null) && (
            <button
              type="button"
              className="btn-cuenta-cliente-orden wide"
              disabled={!puedeIrCuentaCliente || abriendoCuentaCliente}
              onClick={() => void irACuentaCliente()}
              title={
                puedeIrCuentaCliente
                  ? 'Abrir la cuenta vinculada a esta orden'
                  : 'Registre la orden para abrir su cuenta'
              }
            >
              {abriendoCuentaCliente ? 'Abriendo cuenta…' : '💳 Cuenta del cliente'}
            </button>
          )}
          <button type="button" className="btn-success wide" disabled={!puedeAccionesPdf} onClick={imprimirEtiquetas}>
            🏷️ Imprimir etiqueta (PDF)
          </button>
          <button type="button" className="btn-primary wide" disabled={!puedeAccionesPdf} onClick={enviarOrdenPdf}>
            📄 Imprimir orden de servicio
          </button>
          <button
            type="button"
            className="btn-success wide"
            disabled={!puedeAccionesPdf || !telClienteUi}
            onClick={() => void abrirMenuWhatsApp()}
            title={
              !telClienteUi
                ? 'El cliente no tiene teléfono registrado'
                : 'Enviar orden, anticipo o pago total por WhatsApp al cliente'
            }
          >
            📲 Enviar por WhatsApp
          </button>
          {(esOrdenExistente || idReparacion != null) && (
            <button
              type="button"
              className="btn-eliminar-orden wide"
              onClick={() => intentarEliminar(() => setEliminarConfirmAbierto(true))}
            >
              🗑️ Eliminar orden
            </button>
          )}
          <button type="button" className="btn-danger wide" onClick={onSalir}>
            ❌ Salir
          </button>
        </div>
      </div>

      {waMenuAbierto && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => cerrarMenuWhatsApp()}
        >
          <div
            className={`modal${waExitoVisible ? ' modal-alerta modal-alerta--success' : ''}`}
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>📲 Enviar por WhatsApp</h3>
            </div>
            {waExitoVisible ? (
              <div className="modal-body wa-enviado-exito" role="status" aria-live="polite">
                <div className="wa-enviado-icono" aria-hidden="true">
                  ✓
                </div>
                <p className="wa-enviado-texto">Mensaje enviado</p>
              </div>
            ) : (
              <>
                <div className="modal-body wa-menu-body">
                  <button
                    type="button"
                    className={`wa-menu-option btn-primary wide${waEnviados.orden ? ' wa-menu-option--enviado' : ''}`}
                    disabled={enviandoWa || waEnviados.orden}
                    onClick={() => void elegirEnvioWhatsApp('orden')}
                  >
                    {waEnviados.orden ? '✓ Mensaje enviado' : enviandoWa ? 'Enviando…' : '📋 Enviar orden cliente'}
                  </button>
                  <button
                    type="button"
                    className={`wa-menu-option btn-anticipo wide${waEnviados.anticipo ? ' wa-menu-option--enviado' : ''}`}
                    disabled={enviandoWa || waEnviados.anticipo}
                    onClick={() => void elegirEnvioWhatsApp('anticipo')}
                  >
                    {waEnviados.anticipo ? '✓ Mensaje enviado' : enviandoWa ? 'Enviando…' : '💰 Enviar anticipo de cliente'}
                  </button>
                  <button
                    type="button"
                    className={`wa-menu-option btn-liquidacion wide${puedeEnviarPagoTotalWa ? ' btn-liquidacion--activo' : ' btn-liquidacion--inactivo'}${waEnviados.liquidacion ? ' wa-menu-option--enviado' : ''}`}
                    disabled={enviandoWa || consultandoCuentaWa || !puedeEnviarPagoTotalWa || waEnviados.liquidacion}
                    title={
                      waEnviados.liquidacion
                        ? 'Este mensaje ya se envió en esta sesión'
                        : puedeEnviarPagoTotalWa
                          ? 'Enviar confirmación de pago total (cuenta liquidada o orden entregada)'
                          : 'Disponible cuando liquide la cuenta en Ventas o marque la orden entregada'
                    }
                    onClick={() => void elegirEnvioWhatsApp('liquidacion')}
                  >
                    {waEnviados.liquidacion
                      ? '✓ Mensaje enviado'
                      : enviandoWa
                        ? 'Enviando…'
                        : consultandoCuentaWa
                          ? 'Verificando cuenta…'
                          : '✅ Pago total (cuenta liquidada)'}
                  </button>
                </div>
                <div className="modal-footer">
                  <button type="button" className="secondary" disabled={enviandoWa} onClick={() => cerrarMenuWhatsApp()}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ModalAlerta
        open={alertaVerificarEntregaAbierto}
        onClose={() => setAlertaVerificarEntregaAbierto(false)}
        titulo="Verificación requerida"
        mensaje={MENSAJE_VERIFICAR_ANTES_ENTREGADO}
        variante="warning"
        tituloId="alerta-verificar-entrega-titulo"
      />

      <ModalAlerta
        open={alertaTransicionEstatusAbierto}
        onClose={() => setAlertaTransicionEstatusAbierto(false)}
        titulo="Cambio de estatus no permitido"
        mensaje={mensajeTransicionEstatus}
        variante="warning"
        tituloId="alerta-transicion-estatus-titulo"
      />

      <ModalAlerta
        open={dialogExito}
        onClose={() => setDialogExito(false)}
        titulo={idReparacion ? 'Éxito' : 'Mensaje'}
        mensaje={msgExito}
        variante="success"
        textoBoton="Aceptar"
        role="dialog"
      />

      {confirmGuardarAbierto && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !guardandoOrden && setConfirmGuardarAbierto(false)}
        >
          <div className="modal modal-wide modal-alerta modal-alerta--info" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header confirmar-datos-header">
              <span className="confirmar-datos-header-ico" aria-hidden="true">
                ✓
              </span>
              <div>
                <h3>📝 {TEXTO_VERIFICAR_DATOS}</h3>
                <p className="confirmar-datos-lead">
                  Revise cliente, equipo y orden. El <strong>número de orden</strong> lo asigna la base de datos al
                  guardar (consecutivo). Si corrigió la serie aquí, se actualizará en el equipo antes de crear la orden.
                </p>
              </div>
            </div>
            <div className="modal-body">
              {renderResumenOrdenConfirmacion()}
              <p className="confirmar-datos-pregunta confirmar-datos-pregunta--destacada">
                ¿Los datos son correctos? Confirme para registrar la orden.
              </p>
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
                onClick={async (e) => {
                  e.preventDefault()
                  if (guardandoRef.current || ordenRegistradaRef.current || ordenRegistrada) return
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

      {confirmActualizarAbierto && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !actualizandoOrden && setConfirmActualizarAbierto(false)}
        >
          <div
            className="modal modal-wide modal-alerta modal-alerta--info modal-confirmar-actualizar"
            role="dialog"
            aria-labelledby="confirmar-actualizar-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header confirmar-datos-header">
              <span className="confirmar-datos-header-ico" aria-hidden="true">
                ℹ
              </span>
              <div>
                <h3 id="confirmar-actualizar-heading">Verificar datos antes de actualizar</h3>
                <p className="confirmar-datos-lead">
                  Revise la información de la orden #{idReparacion ?? numeroOrden ?? '—'}. Si todo es correcto,
                  confirme para guardar los cambios en la base de datos.
                </p>
              </div>
            </div>
            <div className="modal-body">
              {renderResumenOrdenConfirmacion({ incluirNumeroOrden: true })}
              <p className="confirmar-datos-pregunta confirmar-datos-pregunta--destacada">
                ¿Los datos son correctos? Confirme para actualizar la orden.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmActualizarAbierto(false)}
                disabled={actualizandoOrden}
              >
                Volver a editar
              </button>
              <button
                type="button"
                className="modal-alerta-btn btn-confirm-guardar"
                disabled={actualizandoOrden}
                onClick={() => void actualizarOrdenCore()}
              >
                {actualizandoOrden ? 'Guardando…' : '✅ Confirmar y actualizar'}
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
          <div className="modal modal-alerta modal-alerta--warning" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="eliminar-orden-titulo">
                <span className="modal-alerta-icon" aria-hidden="true">
                  ⚠
                </span>
                Eliminar orden de servicio
              </h3>
            </div>
            <div className="modal-body">
              <p className="modal-alerta-mensaje">
                ¿Seguro que deseas eliminar la orden{' '}
                <strong>#{idReparacion ?? numeroOrden ?? '—'}</strong> de{' '}
                <strong>{nombreClienteUi || 'el cliente'}</strong>?
              </p>
              <p className="modal-alerta-sugerencia">
                Esta acción <strong>no se puede deshacer</strong>. También se eliminarán la cuenta asociada y todos
                los pagos/anticipos registrados.
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
