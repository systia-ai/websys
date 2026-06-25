import { ESTATUS_ORDEN, TIPOS_REPARACION } from './catalogos.js'
import { sameId } from './clienteUtils.js'
import { separarTecnicos, corregirNombreTecnico } from './tecnicosCatalogo.js'

/** Claves del catálogo en mayúsculas (SERVICIO, GARANTIA EPSON, GARANTIA SISTEBIT). */
export const TIPOS_SERVICIO_CANONICOS = TIPOS_REPARACION.map((t) => String(t).trim().toUpperCase())

function sinAcentos(s) {
  return String(s)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * Normaliza `tipo_reparacion` al catálogo. Devuelve null si no es uno de los tres tipos.
 * Acepta variantes con acentos y textos legacy que contengan EPSON o SISTEBIT.
 */
export function claveCanonicaTipoServicio(raw) {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const norm = sinAcentos(t)
  for (const cat of TIPOS_REPARACION) {
    const c = String(cat).trim().toUpperCase()
    if (norm === sinAcentos(cat)) return c
  }
  if (norm.includes('SISTEBIT')) return 'GARANTIA SISTEBIT'
  if (norm.includes('EPSON')) return 'GARANTIA EPSON'
  if (norm === 'SERVICIO' || (norm.startsWith('SERVICIO') && !norm.includes('GARANT'))) {
    return 'SERVICIO'
  }
  return null
}

export const TIPO_GARANTIA_EPSON = 'GARANTIA EPSON'
export const TIPO_GARANTIA_SISTEBIT = 'GARANTIA SISTEBIT'

/** Tipos de orden sin cobro al cliente (cuenta liquidable en $0). */
export const TIPOS_GARANTIA_SIN_COBRO = [TIPO_GARANTIA_EPSON, TIPO_GARANTIA_SISTEBIT]

export function esGarantiaSinCobroTipo(tipo) {
  const c = claveCanonicaTipoServicio(tipo)
  return c != null && TIPOS_GARANTIA_SIN_COBRO.includes(c)
}

export function esGarantiaSinCobroRep(rep) {
  return esGarantiaSinCobroTipo(rep?.tipo_reparacion)
}

/** Etiqueta legible para garantías sin cobro. */
export function etiquetaGarantiaSinCobro(tipo) {
  const c = claveCanonicaTipoServicio(tipo)
  if (c === TIPO_GARANTIA_EPSON) return 'Garantía Epson'
  if (c === TIPO_GARANTIA_SISTEBIT) return 'Garantía Sistebit'
  return 'Garantía'
}

export function esGarantiaEpsonTipo(tipo) {
  return claveCanonicaTipoServicio(tipo) === TIPO_GARANTIA_EPSON
}

/** @deprecated use esGarantiaSinCobroRep */
export function esGarantiaEpsonRep(rep) {
  return esGarantiaEpsonTipo(rep?.tipo_reparacion)
}

/**
 * Tipo de servicio de la orden. Por defecto solo `reparaciones.tipo_reparacion`
 * (no hereda del equipo, para que el filtro del monitor coincida con la orden).
 */
export function tipoServicioDeRep(rep, equipoPorId = null, { usarEquipoSiFalta = false } = {}) {
  let raw = String(rep?.tipo_reparacion ?? '').trim()
  if (!raw && usarEquipoSiFalta && rep?.equipo_id != null && equipoPorId) {
    const eq = equipoPorId.get(String(rep.equipo_id))
    raw = String(eq?.tipo_reparacion ?? '').trim()
  }
  return claveCanonicaTipoServicio(raw)
}

/** True si la orden ya salió del taller (entregada al cliente). */
export function estatusEsEntregado(estatus) {
  return /ENTREGAD[OA]\b/i.test(String(estatus ?? '').trim())
}

export function estatusEsEnRevision(estatus) {
  return String(estatus ?? '').trim().toUpperCase() === 'EN REVISION'
}

export function estatusEsReparado(estatus) {
  return String(estatus ?? '').trim().toUpperCase() === 'REPARADO'
}

export function estatusEsSinReparacion(estatus) {
  return String(estatus ?? '').trim().toUpperCase() === 'SIN REPARACION'
}

/** REPARADO o SIN REPARACION: puede verificarse antes de ENTREGADO. */
export function estatusListoParaVerificacionEntrega(estatus) {
  return estatusEsReparado(estatus) || estatusEsSinReparacion(estatus)
}

export function estatusEsIngresado(estatus) {
  return String(estatus ?? '').trim().toUpperCase() === 'INGRESADO'
}

/** Secuencia principal obligatoria (no saltar pasos hacia adelante). */
export const FLUJO_ESTATUS_ORDEN = ['INGRESADO', 'EN REVISION', 'REPARADO', 'ENTREGADO']

/** Estatus laterales permitidos solo desde EN REVISION. */
export const ESTATUS_LATERALES_DESDE_REVISION = ['EN ESPERA POR REFACCION', 'SIN REPARACION']

export function normalizarEstatusOrden(st) {
  const u = String(st ?? '').trim().toUpperCase()
  if (u === 'ENTREGADA') return 'ENTREGADO'
  return u
}

export function estatusSiguienteEnFlujo(estatus) {
  const st = normalizarEstatusOrden(estatus)
  const idx = FLUJO_ESTATUS_ORDEN.indexOf(st)
  if (idx < 0 || idx >= FLUJO_ESTATUS_ORDEN.length - 1) return null
  return FLUJO_ESTATUS_ORDEN[idx + 1]
}

/** Estatus a los que se puede cambiar desde el actual (un paso; incluye retroceso en el flujo). */
export function estatusSiguientesPermitidos(estatusActual) {
  const actual = normalizarEstatusOrden(estatusActual)
  if (actual === 'ENTREGADO') return []

  const opciones = new Set()

  if (ESTATUS_LATERALES_DESDE_REVISION.includes(actual)) {
    opciones.add('EN REVISION')
    opciones.add('REPARADO')
    if (actual === 'SIN REPARACION') opciones.add('ENTREGADO')
    return [...opciones]
  }

  const siguiente = estatusSiguienteEnFlujo(actual)
  if (siguiente) opciones.add(siguiente)

  if (actual === 'EN REVISION') {
    for (const lat of ESTATUS_LATERALES_DESDE_REVISION) opciones.add(lat)
  }

  const idx = FLUJO_ESTATUS_ORDEN.indexOf(actual)
  if (idx > 0) opciones.add(FLUJO_ESTATUS_ORDEN[idx - 1])

  return [...opciones]
}

function mensajeTransicionEstatusInvalida(desde, hacia, siguiente) {
  const d = normalizarEstatusOrden(desde)
  const h = normalizarEstatusOrden(hacia)
  if (d === 'INGRESADO' && h === 'REPARADO') {
    return 'No puede cambiar el estatus de Ingresado a Reparado. Primero debe estar en Revisión para poder estar en Reparado.'
  }
  if (d === 'INGRESADO' && h === 'ENTREGADO') {
    return 'No puede cambiar el estatus de Ingresado a Entregado. Debe pasar por En revisión y Reparado, en ese orden.'
  }
  if (d === 'INGRESADO' && (h === 'EN ESPERA POR REFACCION' || h === 'SIN REPARACION')) {
    return 'No puede saltar a ese estatus desde Ingresado. El siguiente paso es En revisión.'
  }
  if (d === 'EN REVISION' && h === 'ENTREGADO') {
    return 'No puede cambiar el estatus de En revisión a Entregado. Primero debe estar en Reparado o Sin reparación.'
  }
  if (d === 'REPARADO' && h === 'INGRESADO') {
    return 'No puede regresar de Reparado a Ingresado. Solo puede retroceder un paso a En revisión.'
  }
  if (siguiente) {
    const sigLegible =
      siguiente === 'EN REVISION'
        ? 'En revisión'
        : siguiente === 'REPARADO'
          ? 'Reparado'
          : siguiente === 'ENTREGADO'
            ? 'Entregado'
            : siguiente
    return `No puede saltar etapas. El siguiente estatus permitido es ${sigLegible}.`
  }
  return 'No puede cambiar a ese estatus desde el estatus actual.'
}

/** Valida cambio de estatus (un paso; sin saltos hacia adelante). */
export function validarTransicionEstatus(estatusActual, estatusNuevo) {
  const actual = normalizarEstatusOrden(estatusActual)
  const nuevo = normalizarEstatusOrden(estatusNuevo)
  const siguiente = estatusSiguienteEnFlujo(actual)

  if (actual === nuevo) {
    return { ok: true, estatusSiguiente: siguiente }
  }

  const permitidos = estatusSiguientesPermitidos(actual)
  if (permitidos.includes(nuevo)) {
    return { ok: true, estatusSiguiente: estatusSiguienteEnFlujo(nuevo) }
  }

  return {
    ok: false,
    estatusSiguiente: siguiente,
    estatusSugerido: siguiente,
    mensaje: mensajeTransicionEstatusInvalida(actual, nuevo, siguiente),
  }
}

/** Al guardar: el estatus en BD solo puede avanzar un paso válido desde el persistido. */
export function validarTransicionEstatusAlGuardar(estatusPersistido, estatusNuevo) {
  return validarTransicionEstatus(estatusPersistido, estatusNuevo)
}

/** Transición En revisión ↔ Reparado: requiere confirmación explícita del usuario. */
export function transicionEstatusRequiereConfirmacion(estatusActual, estatusNuevo) {
  const actual = normalizarEstatusOrden(estatusActual)
  const nuevo = normalizarEstatusOrden(estatusNuevo)
  return (
    (estatusEsEnRevision(actual) && estatusEsReparado(nuevo)) ||
    (estatusEsReparado(actual) && estatusEsEnRevision(nuevo))
  )
}

export function mensajeConfirmacionTransicionEstatus(estatusActual, estatusNuevo) {
  const actual = normalizarEstatusOrden(estatusActual)
  const nuevo = normalizarEstatusOrden(estatusNuevo)
  if (estatusEsEnRevision(actual) && estatusEsReparado(nuevo)) {
    return '¿Está seguro que desea cambiar el estatus a Reparado?'
  }
  if (estatusEsReparado(actual) && estatusEsEnRevision(nuevo)) {
    return '¿Está seguro que desea regresar el estatus a En revisión? Se eliminará la fecha de reparado registrada.'
  }
  return ''
}

/** Marca de verificación previa a entrega (no es un estatus). */
export function estaVerificadoEntrega(rep) {
  const v = rep?.verificado_entrega
  if (v === true || v === 1) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === 'true' || s === '1'
  }
  return false
}

export function fechaVerificacionEntregaYmd(rep) {
  return aYmdLocalDesdeRaw(rep?.fecha_verificacion_entrega ?? rep?.fechaVerificacionEntrega)
}

/** En REPARADO o SIN REPARACION se puede marcar verificación antes de ENTREGADO. */
export function estatusPermiteVerificacionEntrega(estatus) {
  return estatusListoParaVerificacionEntrega(estatus)
}

export const MENSAJE_VERIFICAR_ANTES_ENTREGADO =
  'Debe verificar el equipo antes de marcar la orden como ENTREGADO. Use el botón «Verificar listo para entrega».'

/** Bloquea ENTREGADO si está listo para verificación y aún no se verificó. */
export function bloqueaEntregaSinVerificacion(estatusActual, verificado) {
  return estatusListoParaVerificacionEntrega(estatusActual) && !verificado
}

/** Verificada y pendiente de entrega al cliente (misma lógica que filtro del monitor). */
export function repEsVerificadaListaEntrega(rep) {
  return estaVerificadoEntrega(rep) && !estatusEsEntregado(rep?.estatus)
}

export function patchVerificadoEntrega(verificado = true) {
  const now = new Date().toISOString()
  return {
    verificado_entrega: !!verificado,
    fecha_verificacion_entrega: verificado ? now : null,
    updated_at: now,
  }
}

function reducirPayloadReparacionTrasError(error, payload) {
  const msg = String(error?.message ?? error ?? '').toLowerCase()
  if (msg.includes('permission') || msg.includes('row-level security') || msg.includes('rls')) {
    throw new Error(
      'No tiene permiso para actualizar esta orden en la base de datos. Revise la sesión de Supabase o las políticas RLS del proyecto.',
    )
  }
  if ('fecha_entrega' in payload && esErrorColumnaDesconocida(error, 'fecha_entrega')) {
    const { fecha_entrega: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('fecha_ingreso' in payload && esErrorColumnaDesconocida(error, 'fecha_ingreso')) {
    const { fecha_ingreso: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('fecha_revision' in payload && esErrorColumnaDesconocida(error, 'fecha_revision')) {
    const { fecha_revision: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('fecha_reparado' in payload && esErrorColumnaDesconocida(error, 'fecha_reparado')) {
    const { fecha_reparado: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('fecha_sin_reparacion' in payload && esErrorColumnaDesconocida(error, 'fecha_sin_reparacion')) {
    const { fecha_sin_reparacion: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('bitacora' in payload && esErrorColumnaDesconocida(error, 'bitacora')) {
    const { bitacora: _b, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('verificado_entrega' in payload && esErrorColumnaDesconocida(error, 'verificado_entrega')) {
    const { verificado_entrega: _v, fecha_verificacion_entrega: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if ('fecha_verificacion_entrega' in payload && esErrorColumnaDesconocida(error, 'fecha_verificacion_entrega')) {
    const { fecha_verificacion_entrega: _f, ...rest } = payload
    if (Object.keys(rest).length > 0) return rest
  }
  if (payload.es_orden_duplicada != null && esErrorColumnaDesconocida(error, 'es_orden_duplicada')) {
    const { es_orden_duplicada: _d, ...rest } = payload
    return rest
  }
  throw error
}

const MENSAJE_MIGRACION_VERIFICADO =
  'No se pudo guardar la verificación: en Supabase faltan las columnas verificado_entrega y fecha_verificacion_entrega. En el SQL Editor ejecute supabase/migrations/20260603160000_reparaciones_verificado_entrega.sql, pulse Run y recargue esta página (F5).'

const SELECT_VERIFICACION_CANDIDATOS = [
  'id, verificado_entrega, fecha_verificacion_entrega, estatus, fecha_ingreso, fecha_revision, fecha_reparado, fecha_sin_reparacion, fecha_entrega',
  'id, verificado_entrega, fecha_verificacion_entrega, estatus, fecha_ingreso, fecha_revision, fecha_reparado, fecha_entrega',
  'id, verificado_entrega, fecha_verificacion_entrega, estatus',
  'id, verificado_entrega, estatus',
  'id, estatus',
]

function filaVerificacionDesdePayload(reparaId, payload, fechaFallback, dataParcial = null) {
  return {
    id: reparaId,
    estatus: dataParcial?.estatus ?? payload.estatus ?? null,
    verificado_entrega:
      dataParcial?.verificado_entrega ??
      ('verificado_entrega' in payload ? payload.verificado_entrega : false),
    fecha_verificacion_entrega:
      dataParcial?.fecha_verificacion_entrega ??
      payload.fecha_verificacion_entrega ??
      fechaFallback,
    fecha_ingreso: dataParcial?.fecha_ingreso ?? payload.fecha_ingreso ?? null,
    fecha_revision: dataParcial?.fecha_revision ?? payload.fecha_revision ?? null,
    fecha_reparado: dataParcial?.fecha_reparado ?? payload.fecha_reparado ?? null,
    fecha_sin_reparacion: dataParcial?.fecha_sin_reparacion ?? payload.fecha_sin_reparacion ?? null,
    fecha_entrega: dataParcial?.fecha_entrega ?? payload.fecha_entrega ?? null,
  }
}

/**
 * UPDATE + SELECT en una sola petición; prueba distintos SELECT si faltan columnas opcionales.
 */
async function actualizarVerificacionConSelect(supabase, reparaId, payload, fechaFallback) {
  let lastColumnError = null
  for (const cols of SELECT_VERIFICACION_CANDIDATOS) {
    const { data, error } = await supabase
      .from('reparaciones')
      .update(payload)
      .eq('id', reparaId)
      .select(cols)
      .maybeSingle()

    if (!error) {
      if (!data) {
        return {
          ok: false,
          error: new Error(
            `No se encontró la orden #${reparaId}. Compruebe el número de orden y su sesión en Supabase.`,
          ),
        }
      }
      return {
        ok: true,
        data: filaVerificacionDesdePayload(reparaId, payload, fechaFallback, data),
      }
    }

    if (
      esErrorColumnaDesconocida(error, 'fecha_verificacion_entrega') ||
      esErrorColumnaDesconocida(error, 'verificado_entrega')
    ) {
      lastColumnError = error
      continue
    }

    return { ok: false, reducePayload: true, error }
  }

  if (lastColumnError) {
    return { ok: false, reducePayload: true, error: lastColumnError }
  }

  return { ok: false, error: new Error('No se pudo guardar la verificación.') }
}

/**
 * Marca o quita verificación de entrega y devuelve la fila guardada.
 * Reintenta sin columnas opcionales si la BD aún no las tiene.
 */
export async function guardarVerificacionEntregaSupabase(
  supabase,
  reparaId,
  verificado,
  patchExtra = {},
  repContext = null,
) {
  let payload = { ...patchVerificadoEntrega(verificado), ...patchExtra }
  if (verificado && repContext) {
    Object.assign(
      payload,
      patchCompletarFechasHitosFaltantes({
        ...repContext,
        verificado_entrega: true,
        fecha_verificacion_entrega: payload.fecha_verificacion_entrega,
        estatus: patchExtra.estatus ?? repContext.estatus,
      }),
    )
  }
  const queriaVerificacion =
    'verificado_entrega' in payload || 'fecha_verificacion_entrega' in payload
  const fechaFallback = verificado ? payload.fecha_verificacion_entrega ?? null : null

  for (let intento = 0; intento < 6; intento += 1) {
    if (
      queriaVerificacion &&
      !('verificado_entrega' in payload) &&
      !('fecha_verificacion_entrega' in payload)
    ) {
      throw new Error(MENSAJE_MIGRACION_VERIFICADO)
    }

    const resultado = await actualizarVerificacionConSelect(
      supabase,
      reparaId,
      payload,
      fechaFallback,
    )

    if (resultado.ok) {
      const data = resultado.data
      if (verificado && !estaVerificadoEntrega(data)) {
        throw new Error(MENSAJE_MIGRACION_VERIFICADO)
      }
      if (!verificado && estaVerificadoEntrega(data)) {
        throw new Error('No se pudo quitar la verificación en la base de datos.')
      }
      return data
    }

    if (resultado.reducePayload) {
      payload = reducirPayloadReparacionTrasError(resultado.error, payload)
      continue
    }

    throw resultado.error
  }

  throw new Error('No se pudo guardar la verificación tras varios intentos.')
}

/**
 * Date en calendario local. Las cadenas `YYYY-MM-DD` no se parsean como UTC
 * (evita mostrar un día menos en México).
 */
export function fechaALocalDate(raw) {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** YYYY-MM-DD en calendario local (nunca UTC de toISOString). */
export function ymdLocalDesdeDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha de hoy en México / zona horaria del navegador. */
export function ymdHoyLocal() {
  return ymdLocalDesdeDate(new Date())
}

/** Convierte timestamp o fecha a YYYY-MM-DD en calendario local. */
export function aYmdLocalDesdeRaw(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = fechaALocalDate(raw)
  if (!d) return null
  return ymdLocalDesdeDate(d)
}

/** Fecha legible en español (calendario local). */
export function formatFechaLegibleEsMx(
  raw,
  opts = { day: 'numeric', month: 'long', year: 'numeric' },
) {
  const d = fechaALocalDate(raw)
  if (!d) {
    return new Date().toLocaleDateString('es-MX', opts)
  }
  return d.toLocaleDateString('es-MX', opts)
}

const BITACORA_LINE_RE = /^(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\t(.+)$/

/** Entradas de bitácora (fecha YYYY-MM-DD + texto). */
export function parseBitacora(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return []
  return s
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return null
      const m = trimmed.match(BITACORA_LINE_RE)
      if (m) return { fecha: m[1], texto: m[2].trim() }
      return { fecha: null, texto: trimmed }
    })
    .filter(Boolean)
}

export function serializarBitacora(entradas) {
  if (!entradas?.length) return null
  const lines = entradas
    .map((e) => {
      const texto = String(e?.texto ?? '').trim()
      if (!texto) return null
      const fecha = e.fecha || ymdHoyLocal()
      return `${fecha}\t${texto}`
    })
    .filter(Boolean)
  return lines.length ? lines.join('\n') : null
}

/** Agrega una nota con la fecha de hoy (calendario local). */
export function agregarEntradaBitacora(raw, texto) {
  const t = String(texto ?? '').trim()
  if (!t) return raw ?? null
  const entradas = parseBitacora(raw)
  entradas.push({ fecha: ymdHoyLocal(), texto: t })
  return serializarBitacora(entradas)
}

/** Marca local YYYY-MM-DD HH:mm para bitácora. */
function stampBitacoraFechaHoraLocal(date = new Date()) {
  const ymd = ymdLocalDesdeDate(date)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${ymd} ${h}:${m}`
}

/** Agrega una nota con fecha y hora locales (p. ej. confirmación de notificación al cliente). */
export function agregarEntradaBitacoraAhora(raw, texto, cuando = new Date()) {
  const t = String(texto ?? '').trim()
  if (!t) return raw ?? null
  const entradas = parseBitacora(raw)
  entradas.push({ fecha: stampBitacoraFechaHoraLocal(cuando), texto: t })
  return serializarBitacora(entradas)
}

export const NOTA_BITACORA_NOTIFICACION_CLIENTE = 'Se notificó al cliente'

const NOTA_BITACORA_NOTIFICACION_RE = /^se (?:le )?notific[oó] al cliente(?:\s*\((\d+)\))?\s*$/i

function esEntradaNotificacionCliente(texto) {
  return NOTA_BITACORA_NOTIFICACION_RE.test(String(texto ?? '').trim())
}

/** Cuántas confirmaciones de notificación hay en la bitácora (incluye notas antiguas sin número). */
export function contarNotificacionesClienteBitacora(raw) {
  return parseBitacora(raw).filter((e) => esEntradaNotificacionCliente(e?.texto)).length
}

/** Texto de bitácora al confirmar notificación al cliente (con número secuencial). */
export function textoNotaBitacoraNotificacionCliente(numero) {
  const n = Number(numero)
  if (Number.isFinite(n) && n > 0) {
    return `${NOTA_BITACORA_NOTIFICACION_CLIENTE} (${n})`
  }
  return NOTA_BITACORA_NOTIFICACION_CLIENTE
}

/** Siguiente número de notificación según entradas existentes. */
export function siguienteNumeroNotificacionCliente(raw) {
  return contarNotificacionesClienteBitacora(raw) + 1
}

/** True si la bitácora incluye al menos una confirmación de notificación al cliente. */
export function bitacoraTieneNotificacionCliente(raw) {
  return contarNotificacionesClienteBitacora(raw) > 0
}

/**
 * Registra en la bitácora de la orden que se notificó al cliente.
 * Devuelve número, texto de la nota y fecha/hora usados.
 */
export async function registrarNotificacionClienteEnBitacora(supabase, reparaId, opts = {}) {
  const rid = normalizarReparacionId(reparaId)
  if (rid == null) throw new Error('ID de orden inválido.')

  let bitacoraActual = ''
  if (supabase?.from) {
    const { data, error } = await supabase.from('reparaciones').select('bitacora').eq('id', rid).maybeSingle()
    if (error) {
      const msg = String(error.message ?? '')
      if (/column .*bitacora.* does not exist/i.test(msg) || error.code === '42703') {
        throw new Error(
          'Falta la columna bitacora en Supabase. Ejecute la migración 20260603140000_reparaciones_bitacora.sql.',
        )
      }
      throw error
    }
    if (!data) throw new Error(`No se encontró la orden #${rid}.`)
    bitacoraActual = data.bitacora ?? ''
  } else if (typeof opts.leerBitacoraLocal === 'function') {
    bitacoraActual = opts.leerBitacoraLocal(rid) ?? ''
  } else {
    throw new Error('No hay conexión a la base de datos.')
  }

  const numeroNotificacion = siguienteNumeroNotificacionCliente(bitacoraActual)
  const nota = textoNotaBitacoraNotificacionCliente(numeroNotificacion)
  const cuando = new Date()
  const bitacoraActualizada = agregarEntradaBitacoraAhora(bitacoraActual, nota, cuando)
  if (!bitacoraActualizada) {
    throw new Error('No se pudo generar la nota de bitácora.')
  }

  const patch = { bitacora: bitacoraActualizada, updated_at: cuando.toISOString() }

  if (supabase?.from) {
    const actualizada = await actualizarReparacionSupabase(supabase, rid, patch)
    const guardada = String(actualizada?.bitacora ?? '')
    if (!guardada.includes(nota)) {
      throw new Error(
        'La bitácora no se guardó en la orden. Verifique permisos o que la migración de bitácora esté aplicada.',
      )
    }
    return {
      numeroNotificacion,
      nota,
      fechaHora: stampBitacoraFechaHoraLocal(cuando),
      bitacora: guardada,
    }
  }

  if (typeof opts.escribirBitacoraLocal === 'function') {
    opts.escribirBitacoraLocal(rid, bitacoraActualizada, patch.updated_at)
    return {
      numeroNotificacion,
      nota,
      fechaHora: stampBitacoraFechaHoraLocal(cuando),
      bitacora: bitacoraActualizada,
    }
  }

  throw new Error('No hay conexión a la base de datos.')
}

export function formatFechaBitacora(fechaRaw) {
  if (!fechaRaw) return '—'
  const s = String(fechaRaw).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) {
    return formatFechaLegibleEsMx(s, { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const [, ymd, hh, mm] = m
  if (hh != null && mm != null) {
    const [y, mo, d] = ymd.split('-').map(Number)
    const dt = new Date(y, mo - 1, d, Number(hh), Number(mm))
    return dt.toLocaleString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return formatFechaLegibleEsMx(ymd, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Fecha de ingreso al taller: coincide con la alta de la orden (fecha_creacion). */
export function fechaIngresoYmd(rep) {
  const creacion = ymdCreacionOrden(rep)
  if (creacion) return creacion
  const raw =
    rep?.fecha_ingreso ??
    rep?.fechaIngreso ??
    rep?.fecha_registro ??
    rep?.fecha
  return aYmdLocalDesdeRaw(raw)
}

/** Columna / filtro de ingreso en monitor y reportes (misma regla que fechaIngresoYmd). */
export function fechaIngresoFiltroYmd(rep) {
  return fechaIngresoYmd(rep)
}

/** Fecha de ingreso a guardar o mostrar: siempre la de creación de la orden. */
export function ymdIngresoPreservar(rep) {
  return ymdCreacionOrden(rep) ?? fechaIngresoFiltroYmd(rep)
}

/** Órdenes anteriores a esta fecha no usaban el sistema web (sin auto-correcciones ni inferencias). */
export const ORDEN_SISTEMA_DESDE_YMD = '2026-05-01'

/** YMD de alta de la orden (no usa updated_at ni respaldos de UI). */
export function ymdCreacionOrden(rep) {
  return aYmdLocalDesdeRaw(
    rep?.fecha_creacion ?? rep?.created_at ?? rep?.fecha_registro,
  )
}

/** True si un YMD de hito pertenece al periodo del monitor (≥ 1° may 2026). */
export function ymdEnPeriodoMonitor(ymd) {
  const y = aYmdLocalDesdeRaw(ymd)
  return !!(y && y.length >= 10 && y >= ORDEN_SISTEMA_DESDE_YMD)
}

/** Desde efectivo en filtros de fecha: nunca anterior al 1° may 2026. */
export function desdeEfectivoMonitorFiltro(desde) {
  const d = String(desde ?? '').trim()
  if (!d) return ORDEN_SISTEMA_DESDE_YMD
  return d < ORDEN_SISTEMA_DESDE_YMD ? ORDEN_SISTEMA_DESDE_YMD : d
}

/** True si la orden pertenece al periodo con sistema web (alta ≥ 1° may 2026). */
export function ordenUsaSistemaWeb(rep) {
  const creacionYmd = ymdCreacionOrden(rep)
  if (creacionYmd && creacionYmd.length >= 10) {
    return creacionYmd >= ORDEN_SISTEMA_DESDE_YMD
  }
  const ingresoYmd = fechaIngresoFiltroYmd(rep)
  if (!ingresoYmd || ingresoYmd.length < 10) return false
  return ingresoYmd >= ORDEN_SISTEMA_DESDE_YMD
}

/** Monitor de órdenes: solo filas del periodo web (desde 1° may 2026). */
export function repVisibleEnMonitorOrdenes(rep) {
  return ordenUsaSistemaWeb(rep)
}

/**
 * Fecha de entrega (órdenes ENTREGADO/A) para UI y listados.
 * Prioridad: columna fecha_entrega → último pago → fecha_liquidada de la cuenta.
 */
export function fechaEntregaYmd(rep, cuentaVinculada = null, ymdDesdePagos = null) {
  if (!estatusEsEntregado(rep?.estatus)) return null
  const desdeRep = aYmdLocalDesdeRaw(
    rep?.fecha_entrega ?? rep?.fechaEntrega ?? rep?.fecha_entregada ?? rep?.fecha_entrega_cliente,
  )
  if (desdeRep) return desdeRep
  if (ymdDesdePagos) return ymdDesdePagos
  if (cuentaVinculada) {
    const estCuenta = String(cuentaVinculada.estatus ?? '').trim().toUpperCase()
    const liquidada =
      estCuenta === 'LIQUIDADA' ||
      cuentaVinculada.fecha_liquidada != null ||
      cuentaVinculada.fechaLiquidada != null
    if (liquidada) {
      const desdeLiq = aYmdLocalDesdeRaw(
        cuentaVinculada.fecha_liquidada ?? cuentaVinculada.fechaLiquidada,
      )
      if (desdeLiq) return desdeLiq
    }
  }
  return null
}

/** Solo columna `fecha_entrega` (filtros del monitor / reportes). */
export function fechaEntregaFiltroYmd(rep) {
  return aYmdLocalDesdeRaw(
    rep?.fecha_entrega ?? rep?.fechaEntrega ?? rep?.fecha_entregada ?? rep?.fecha_entrega_cliente,
  )
}

/** YMD para guardar al marcar entregada: conserva la existente o usa hoy (local). */
export function ymdFechaEntregaParaGuardar(fechaEntregaExistente) {
  return aYmdLocalDesdeRaw(fechaEntregaExistente) || ymdHoyLocal()
}

/** Fecha en que la orden pasó a EN REVISION (solo columna `fecha_revision`). */
export function fechaRevisionYmd(rep) {
  return aYmdLocalDesdeRaw(rep?.fecha_revision ?? rep?.fechaRevision)
}

/** Alias explícito para filtros (misma columna que fechaRevisionYmd). */
export function fechaRevisionFiltroYmd(rep) {
  return fechaRevisionYmd(rep)
}

/** Fecha en que la orden pasó a SIN REPARACION (solo columna `fecha_sin_reparacion`). */
export function fechaSinReparacionYmd(rep) {
  return aYmdLocalDesdeRaw(rep?.fecha_sin_reparacion ?? rep?.fechaSinReparacion)
}

/** Alias explícito para filtros (misma columna que fechaSinReparacionYmd). */
export function fechaSinReparacionFiltroYmd(rep) {
  return fechaSinReparacionYmd(rep)
}

/** Fecha en que la orden pasó a REPARADO (solo columna `fecha_reparado`). */
export function fechaReparadoYmd(rep) {
  return aYmdLocalDesdeRaw(rep?.fecha_reparado ?? rep?.fechaReparado)
}

/** Alias explícito para filtros (misma columna que fechaReparadoYmd). */
export function fechaReparadoFiltroYmd(rep) {
  return fechaReparadoYmd(rep)
}

/** ¿El técnico asignado a la orden coincide con el filtro del monitor? */
function normalizarNombreTecnico(t) {
  return corregirNombreTecnico(t)
}

/** Técnicos asignados en la orden (1 o 2, formato «JUAN» o «JUAN & VERO»). */
export function nombresTecnicosEnOrden(tecnicoRep) {
  const raw = String(tecnicoRep ?? '').trim()
  if (!raw) return []
  const [t1, t2] = separarTecnicos(raw)
  const out = []
  for (const t of [t1, t2]) {
    const n = normalizarNombreTecnico(t)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

export function tecnicoRepCoincideFiltro(tecnicoRep, filtro) {
  const want = normalizarNombreTecnico(filtro)
  if (!want) return true
  const asignados = nombresTecnicosEnOrden(tecnicoRep)
  if (asignados.length === 0) return false
  return asignados.some((nombre) => {
    if (nombre === want) return true
    if (nombre.startsWith(`${want} `)) return true
    const tokens = nombre.split(/\s+/).filter(Boolean)
    if (tokens[0] === want) return true
    return tokens.includes(want)
  })
}

function textoBusquedaMonitorNorm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * Buscador del monitor (reportes u otros): cliente, #orden, problema, equipo, técnico, estatus.
 * Se aplica sobre el conjunto ya filtrado por estatus, fechas, técnico y tipo de servicio.
 */
export function repCoincideBusquedaTextoMonitor(rep, queryRaw, clientes = [], equipoPorId = null) {
  const q = textoBusquedaMonitorNorm(queryRaw)
  if (!q) return true
  const qSinHash = q.replace(/^#+\s*/, '').trim()
  const idStr = String(rep?.id ?? '').trim()
  if (idStr && (textoBusquedaMonitorNorm(idStr) === qSinHash || idStr.includes(qSinHash))) {
    return true
  }
  const c = (clientes ?? []).find((x) => sameId(x.id, rep?.cliente_id))
  const nombre = textoBusquedaMonitorNorm(c?.nombre ?? c?.Nombre ?? '')
  if (nombre && (nombre.includes(q) || (qSinHash && nombre.includes(qSinHash)))) return true
  const tipoCanon = tipoServicioDeRep(rep, equipoPorId) ?? ''
  const blob = textoBusquedaMonitorNorm(
    [
      nombre,
      idStr,
      rep?.problemas_reportados,
      rep?.descripcion_equipo,
      rep?.tecnico,
      rep?.estatus,
      tipoCanon,
    ]
      .filter(Boolean)
      .join(' '),
  )
  return blob.includes(q) || (qSinHash !== q && qSinHash && blob.includes(qSinHash))
}

/**
 * Buscador del monitor de órdenes: #orden (exacta), problemas_reportados,
 * descripcion_solucion y nombre del cliente.
 * Se aplica sobre el conjunto ya filtrado (estatus, fechas, técnico, tipo de servicio).
 */
export function repCoincideBusquedaProblemaSolucionMonitor(rep, queryRaw, clientes = []) {
  const q = textoBusquedaMonitorNorm(queryRaw)
  if (!q) return true
  const qSinHash = q.replace(/^#+\s*/, '').trim()

  if (/^\d+$/.test(qSinHash)) {
    const idStr = String(rep?.id ?? '').trim()
    return idStr === qSinHash || Number(idStr) === Number(qSinHash)
  }

  const c = (clientes ?? []).find((x) => sameId(x.id, rep?.cliente_id))
  const nombre = textoBusquedaMonitorNorm(c?.nombre ?? c?.Nombre ?? '')
  if (nombre && nombre.includes(q)) return true
  const blob = textoBusquedaMonitorNorm(
    [rep?.problemas_reportados, rep?.descripcion_solucion].filter(Boolean).join(' '),
  )
  return blob.includes(q)
}

/**
 * Completa fechas de hitos que faltan según el estatus actual o verificación.
 * No sobrescribe fechas ya guardadas ni usa `updated_at` como ancla de ingreso.
 */
export function patchCompletarFechasHitosFaltantes(rep) {
  const patch = {}
  if (!rep || !ordenUsaSistemaWeb(rep)) return patch

  const st = normalizarEstatusOrden(rep.estatus)
  const verificado = estaVerificadoEntrega(rep)
  const fechaVerYmd = aYmdLocalDesdeRaw(rep.fecha_verificacion_entrega)
  const fechaEntYmd = aYmdLocalDesdeRaw(
    rep.fecha_entrega ?? rep.fechaEntrega ?? rep.fecha_entregada ?? null,
  )
  const creacionYmd = ymdCreacionOrden(rep)
  const columnaIngreso = aYmdLocalDesdeRaw(rep?.fecha_ingreso ?? rep?.fechaIngreso)
  if (creacionYmd && columnaIngreso !== creacionYmd) {
    patch.fecha_ingreso = creacionYmd
  } else if (!columnaIngreso && creacionYmd) {
    patch.fecha_ingreso = creacionYmd
  }

  const requiereRevision =
    estatusEsEnRevision(st) ||
    estatusEsReparado(st) ||
    estatusEsSinReparacion(st) ||
    estatusEsEntregado(st) ||
    verificado

  if (!fechaRevisionYmd(rep) && requiereRevision && creacionYmd) {
    patch.fecha_revision = creacionYmd
  }

  if (!fechaSinReparacionYmd(rep) && estatusEsSinReparacion(st) && creacionYmd) {
    patch.fecha_sin_reparacion = creacionYmd
  }

  const requiereReparado = estatusEsReparado(st) || estatusEsEntregado(st) || verificado

  if (!fechaReparadoYmd(rep) && requiereReparado) {
    if (fechaVerYmd) patch.fecha_reparado = fechaVerYmd
    else if (fechaEntYmd && estatusEsEntregado(st)) patch.fecha_reparado = fechaEntYmd
  }

  if (estatusEsEntregado(st) && !fechaEntYmd) {
    if (fechaVerYmd) patch.fecha_entrega = fechaVerYmd
  }

  return patch
}

/**
 * Graba fecha_ingreso / fecha_revision / fecha_reparado / fecha_sin_reparacion / fecha_entrega
 * al cambiar de estatus. Si hubo cambio de estatus, asigna la fecha del hito que corresponde;
 * si no cambió, solo completa columnas vacías.
 */
export function patchFechasHitosEstatus(estatusNuevo, repActual = {}, estatusAnterior = null) {
  const patch = {}
  const hoy = ymdFechaEntregaParaGuardar(null)
  const stNuevo = normalizarEstatusOrden(estatusNuevo)
  const stAnt =
    estatusAnterior != null && String(estatusAnterior).trim() !== ''
      ? normalizarEstatusOrden(estatusAnterior)
      : normalizarEstatusOrden(repActual?.estatus)

  // Al salir de REPARADO (excepto a ENTREGADO), borrar fecha_reparado para registrar la nueva al volver.
  if (estatusEsReparado(stAnt) && !estatusEsReparado(stNuevo) && !estatusEsEntregado(stNuevo)) {
    patch.fecha_reparado = null
  }

  // Al entrar a REPARADO desde otro estatus, registrar la fecha de hoy (sustituye una anterior).
  if (estatusEsReparado(stNuevo) && !estatusEsReparado(stAnt)) {
    patch.fecha_reparado = hoy
  }

  const creacion = ymdCreacionOrden(repActual)
  if (creacion) patch.fecha_ingreso = creacion

  function asignarHito(esHito, ymdExistente, col, valor = hoy) {
    if (!esHito(stNuevo)) return
    if (ymdExistente(repActual)) return
    patch[col] = valor
  }

  asignarHito(
    estatusEsIngresado,
    fechaIngresoFiltroYmd,
    'fecha_ingreso',
    ymdIngresoPreservar(repActual) || hoy,
  )
  asignarHito(estatusEsEnRevision, fechaRevisionYmd, 'fecha_revision', hoy)
  asignarHito(estatusEsReparado, fechaReparadoYmd, 'fecha_reparado', hoy)
  asignarHito(estatusEsSinReparacion, fechaSinReparacionYmd, 'fecha_sin_reparacion', hoy)
  if (estatusEsEntregado(stNuevo) && !fechaEntregaFiltroYmd(repActual)) {
    patch.fecha_entrega = ymdFechaEntregaParaGuardar(
      repActual.fecha_entrega ?? repActual.fechaEntrega ?? null,
    )
  }

  const repMerged = { ...repActual, ...patch, estatus: stNuevo }
  if (ordenUsaSistemaWeb(repMerged)) {
    const extra = patchCompletarFechasHitosFaltantes(repMerged)
    for (const [k, v] of Object.entries(extra)) {
      if (!(k in patch)) patch[k] = v
    }
  }
  return patch
}

/** Patch al cambiar estatus: estatus + fechas de hito (columnas fecha_* en BD). */
export function buildPatchCambioEstatusOrden(
  estatusNuevo,
  repActual = {},
  { verificadoEntrega = false, fechaVerificacionEntrega = null, estatusAnterior = null } = {},
) {
  const st = normalizarEstatusOrden(estatusNuevo)
  const ant =
    estatusAnterior != null && String(estatusAnterior).trim() !== ''
      ? normalizarEstatusOrden(estatusAnterior)
      : repActual?.estatus
  const now = new Date().toISOString()
  const patch = {
    estatus: st,
    updated_at: now,
    ...patchFechasHitosEstatus(st, repActual, ant),
  }
  if (estatusEsEntregado(st)) {
    patch.verificado_entrega = true
    patch.fecha_verificacion_entrega = fechaVerificacionEntrega || now
    if (!patch.fecha_entrega) {
      patch.fecha_entrega = ymdFechaEntregaParaGuardar(
        repActual.fecha_entrega ?? repActual.fechaEntrega ?? null,
      )
    }
  } else {
    patch.fecha_entrega = null
    if (!estatusListoParaVerificacionEntrega(st)) {
      patch.verificado_entrega = false
      patch.fecha_verificacion_entrega = null
    } else if (verificadoEntrega) {
      patch.verificado_entrega = true
      patch.fecha_verificacion_entrega = fechaVerificacionEntrega
    }
  }
  return patch
}

/** Persiste estatus + fechas de hito al cambiar de estatus en la orden. */
export async function persistirCambioEstatusOrdenSupabase(
  supabase,
  reparaId,
  estatusNuevo,
  repActual,
  opts = {},
) {
  const patch = buildPatchCambioEstatusOrden(estatusNuevo, repActual, {
    ...opts,
    estatusAnterior: opts.estatusAnterior ?? repActual?.estatus ?? null,
  })
  await actualizarReparacionSupabase(supabase, reparaId, patch)
  return patch
}

/** Persiste en BD las fechas de hitos inferidas (p. ej. al abrir una orden antigua). */
export async function persistirFechasHitosFaltantesSupabase(supabase, repRow) {
  if (!supabase?.from || !repRow?.id || !ordenUsaSistemaWeb(repRow)) return repRow
  const patch = patchCompletarFechasHitosFaltantes(repRow)
  if (!Object.keys(patch).length) return repRow
  await actualizarReparacionSupabase(supabase, repRow.id, patch)
  return { ...repRow, ...patch }
}

/** Hitos de fechas legibles para UI (ingreso, revisión, reparado, entrega). */
export function fechasHitosOrdenLegibles(rep, { cuentaVinculada = null, ymdDesdePagos = null } = {}) {
  const fmt = (ymd) =>
    ymd ? formatFechaLegibleEsMx(ymd, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const hitos = []
  const ing = fechaIngresoYmd(rep)
  if (ing) hitos.push({ clave: 'ingreso', etiqueta: 'Ingreso', texto: fmt(ing) })
  const rev = fechaRevisionYmd(rep)
  if (rev) hitos.push({ clave: 'revision', etiqueta: 'En revisión', texto: fmt(rev) })
  const repa = fechaReparadoYmd(rep)
  if (repa) hitos.push({ clave: 'reparado', etiqueta: 'Reparado', texto: fmt(repa) })
  const sinRep = fechaSinReparacionYmd(rep)
  if (sinRep) hitos.push({ clave: 'sin_reparacion', etiqueta: 'Sin reparación', texto: fmt(sinRep) })
  const ent = fechaEntregaYmd(rep, cuentaVinculada, ymdDesdePagos)
  if (ent) hitos.push({ clave: 'entrega', etiqueta: 'Entrega', texto: fmt(ent) })
  return hitos
}

/** Hitos incl. verificación previa a entrega (para banner de la orden). */
export function fechasHitosOrdenConVerificacion(
  rep,
  { cuentaVinculada = null, ymdDesdePagos = null, verificado = false, fechaVerificacion = null } = {},
) {
  const hitos = fechasHitosOrdenLegibles(rep, { cuentaVinculada, ymdDesdePagos })
  if (verificado) {
    const fmtHora = (raw) =>
      raw
        ? formatFechaLegibleEsMx(raw, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null
    const texto = fmtHora(fechaVerificacion) ?? fmtHora(new Date().toISOString())
    if (texto) {
      hitos.push({ clave: 'verificacion', etiqueta: 'Verificado', texto })
    }
  }
  return hitos
}

function ymdEnRango(ymd, desde, hasta) {
  if (!ymd) return false
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (d && ymd < d) return false
  if (h && ymd > h) return false
  return true
}

/**
 * Fecha del hito para filtro por rango en el monitor.
 * Solo columnas de BD: fecha_ingreso, fecha_revision, fecha_reparado, fecha_entrega.
 */
export function fechaHitoEstatusMonitor(rep) {
  const st = normalizarEstatusOrden(rep?.estatus)
  if (estatusEsEntregado(st)) return fechaEntregaFiltroYmd(rep)
  if (estatusEsReparado(st)) return fechaReparadoFiltroYmd(rep)
  if (estatusEsSinReparacion(st)) return fechaSinReparacionFiltroYmd(rep)
  if (estatusEsEnRevision(st)) return fechaRevisionFiltroYmd(rep)
  if (estatusEsIngresado(st)) return fechaIngresoFiltroYmd(rep)
  return fechaRevisionFiltroYmd(rep)
}

function ymdEnRangoMonitor(ymd, desde, hasta) {
  if (!ymdEnPeriodoMonitor(ymd)) return false
  return ymdEnRango(ymd, desdeEfectivoMonitorFiltro(desde), hasta)
}

/**
 * Rango Desde/Hasta del monitor (solo columnas de hitos en BD; omite fechas antes del 1° may 2026).
 * @param {'todas'|'ingreso'|'entrega'|'reparado'|'revision'|'ambas'} modo
 */
export function repEnRangoFechasMonitor(
  rep,
  desde,
  hasta,
  _cuentaVinculada = null,
  _ymdDesdePagos = null,
  modo = 'ingreso',
) {
  if (modo === 'todas') return true
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (!d && !h) return true
  if (modo === 'ingreso') return ymdEnRangoMonitor(fechaIngresoFiltroYmd(rep), d, h)
  if (modo === 'entrega') return ymdEnRangoMonitor(fechaEntregaFiltroYmd(rep), d, h)
  if (modo === 'reparado') return ymdEnRangoMonitor(fechaReparadoFiltroYmd(rep), d, h)
  if (modo === 'sin_reparacion') return ymdEnRangoMonitor(fechaSinReparacionFiltroYmd(rep), d, h)
  if (modo === 'revision') return ymdEnRangoMonitor(fechaRevisionFiltroYmd(rep), d, h)
  const ymd = fechaHitoEstatusMonitor(rep)
  return ymdEnRangoMonitor(ymd, d, h)
}

/**
 * ¿La orden cumple el filtro del monitor?
 * - Chips de estatus: solo órdenes cuyo estatus actual está seleccionado.
 * - `modoFecha` 'ingreso' (Fecha registrado): rango sobre fecha_ingreso; ignora chips de estatus
 *   (cuántas órdenes entraron ese día, aunque ya estén reparadas o entregadas).
 * - `modoFecha` 'reparado' (Fecha reparado): rango sobre fecha_reparado; ignora chips de estatus
 *   (cuántas pasaron a reparado ese día, aunque ya estén entregadas).
 * - `modoFecha` 'entrega' (Fecha entrega): rango sobre fecha_entrega; ignora chips de estatus
 *   (cuántas se entregaron ese día, sin importar otros filtros de estatus).
 * - `modoFecha` 'verificadas': verificadas pendientes de entrega.
 * - Sin chip de fecha especial: solo filtra por chips de estatus (el rango Desde/Hasta no aplica).
 * - Solo órdenes dadas de alta desde el 1° may 2026; fechas de hito anteriores se omiten.
 */
export function repCoincideFiltroMonitor(
  rep,
  {
    estatusSeleccionados,
    desde,
    hasta,
    modoFecha = null,
    cuentaVinculada = null,
    ymdDesdePagos = null,
    estatusParaFiltroFn = (r) => String(r?.estatus ?? '').trim().toUpperCase(),
  },
) {
  if (!ordenUsaSistemaWeb(rep)) return false

  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  const hayRango = Boolean(d || h)
  const desdeEf = desdeEfectivoMonitorFiltro(d)

  if (modoFecha === 'ingreso' || modoFecha === 'entrega' || modoFecha === 'reparado') {
    if (!hayRango) return false
    if (!repEnRangoFechasMonitor(rep, desdeEf, h, cuentaVinculada, ymdDesdePagos, modoFecha)) {
      return false
    }
    return true
  }

  if (modoFecha === 'verificadas') {
    if (!repEsVerificadaListaEntrega(rep)) return false
    if (!hayRango) return true
    const ymdVer = fechaVerificacionEntregaYmd(rep)
    return ymdVer ? ymdEnRangoMonitor(ymdVer, desdeEf, h) : false
  }

  const sel = estatusSeleccionados
  const st = estatusParaFiltroFn(rep)
  if (sel.size === 0 || !sel.has(st)) return false
  return true
}

/** Campos al marcar orden entregada (Ventas / liquidación). Incluye fechas de hitos. */
export function patchReparacionEntregada(repActual = {}, opts = {}) {
  const rep = repActual && typeof repActual === 'object' ? repActual : {}
  return buildPatchCambioEstatusOrden('ENTREGADO', rep, {
    verificadoEntrega: estaVerificadoEntrega(rep) || !!opts.verificadoEntrega,
    fechaVerificacionEntrega: rep.fecha_verificacion_entrega ?? opts.fechaVerificacionEntrega ?? null,
    estatusAnterior: opts.estatusAnterior ?? rep.estatus ?? null,
  })
}

const SELECT_REPARACION_FECHAS_HITOS =
  'fecha_entrega, fecha_ingreso, fecha_revision, fecha_reparado, fecha_sin_reparacion, estatus, verificado_entrega, fecha_verificacion_entrega, fecha_creacion, created_at, updated_at'

function esErrorColumnaDesconocida(error, nombreColumna) {
  const msg = String(error?.message ?? error ?? '').toLowerCase()
  const code = String(error?.code ?? '')
  const col = String(nombreColumna ?? '').toLowerCase()
  if (!col) return msg.includes('column') || code === 'PGRST204' || code === '42703'
  return (
    msg.includes(col) ||
    (msg.includes('column') && msg.includes(col.replace(/_/g, ''))) ||
    code === 'PGRST204' ||
    code === '42703'
  )
}

/** ID numérico de reparación para consultas Supabase/local. */
export function normalizarReparacionId(id) {
  if (id == null || id === '') return null
  const n = Number(id)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** UPDATE en reparaciones; reintenta sin columnas opcionales si la BD aún no las tiene. */
export async function actualizarReparacionSupabase(supabase, reparaId, patch) {
  const rid = normalizarReparacionId(reparaId)
  if (rid == null) throw new Error('ID de orden inválido.')
  let payload = { ...patch }
  const queriaVerificacion =
    'verificado_entrega' in patch || 'fecha_verificacion_entrega' in patch
  const queriaBitacora = 'bitacora' in patch
  for (let intento = 0; intento < 6; intento += 1) {
    const { data, error } = await supabase
      .from('reparaciones')
      .update(payload)
      .eq('id', rid)
      .select('id, bitacora')
    if (!error) {
      if (!data?.length) {
        throw new Error(`No se encontró la orden #${rid} para actualizar.`)
      }
      if (
        queriaVerificacion &&
        !('verificado_entrega' in payload) &&
        !('fecha_verificacion_entrega' in payload)
      ) {
        throw new Error(
          'No se pudo guardar la verificación: falta la columna verificado_entrega en Supabase. Ejecute la migración 20260603160000_reparaciones_verificado_entrega.sql.',
        )
      }
      if (queriaBitacora && !('bitacora' in payload)) {
        throw new Error(
          'No se pudo guardar la bitácora: falta la columna bitacora en Supabase. Ejecute la migración 20260603140000_reparaciones_bitacora.sql.',
        )
      }
      return data[0]
    }
    payload = reducirPayloadReparacionTrasError(error, payload)
  }
  throw new Error('No se pudo actualizar la orden tras varios intentos.')
}

/** Patch ENTREGADO si la orden aún no está entregada (p. ej. al liquidar cuenta). */
export function patchOrdenEntregadaSiAplica(repRow = {}, opts = {}) {
  if (!repRow?.id || estatusEsEntregado(repRow.estatus)) return null
  return patchReparacionEntregada(repRow, { estatusAnterior: repRow.estatus, ...opts })
}

/**
 * Cuenta LIQUIDADA implica entrega al cliente: la orden vinculada pasa a ENTREGADO si aún no lo está.
 */
export async function entregarOrdenVinculadaSiCuentaLiquidada(supabase, cuentaId, reparaIdOpt = null) {
  if (!supabase?.from || cuentaId == null) return null
  let rid = normalizarReparacionId(reparaIdOpt)
  if (rid == null) {
    const { data: cuenta, error } = await supabase
      .from('cuentas')
      .select('repara_id')
      .eq('id', cuentaId)
      .maybeSingle()
    if (error) throw error
    rid = normalizarReparacionId(cuenta?.repara_id)
  }
  if (rid == null) return null
  const { data: rep, error: eRep } = await supabase
    .from('reparaciones')
    .select('estatus')
    .eq('id', rid)
    .maybeSingle()
  if (eRep) throw eRep
  if (!rep || estatusEsEntregado(rep.estatus)) return null
  return marcarReparacionEntregadaSupabase(supabase, rid)
}

/** Actualiza reparación a entregada con todas las fechas de hito correspondientes. */
export async function marcarReparacionEntregadaSupabase(supabase, reparaId) {
  const rid = normalizarReparacionId(reparaId)
  if (rid == null) throw new Error('ID de orden inválido.')
  let rep = {}
  if (supabase?.from) {
    const { data } = await supabase
      .from('reparaciones')
      .select(SELECT_REPARACION_FECHAS_HITOS)
      .eq('id', rid)
      .maybeSingle()
    rep = data ?? {}
  }
  const patch = patchReparacionEntregada(rep, { estatusAnterior: rep.estatus })
  await actualizarReparacionSupabase(supabase, rid, patch)
  return patch
}

/**
 * Reparación marcada ENTREGADA por error: solo anticipo registrado y aún sin cargos.
 * No revierte entregas reales (con fecha_entrega, cargos o movimientos en cuenta).
 * IMPORTANTE: no invocar al abrir/cargar una orden; solo corrección explícita si aplica.
 */
export async function corregirEntregadaIndebidaSiAplica(supabase, repRow) {
  if (!supabase?.from || !repRow?.id || !estatusEsEntregado(repRow.estatus)) {
    return repRow
  }
  if (!ordenUsaSistemaWeb(repRow)) return repRow

  // Entrega ya registrada con fecha: no tocar (evita revertir órdenes entregadas al cliente).
  if (aYmdLocalDesdeRaw(repRow.fecha_entrega)) {
    return repRow
  }

  const { data: cuentas, error: eC } = await supabase
    .from('cuentas')
    .select('id, estatus, total')
    .eq('repara_id', repRow.id)
    .limit(3)
  if (eC) return repRow

  const cuenta = cuentas?.[0]
  if (!cuenta?.id) return repRow

  const estCuenta = String(cuenta.estatus ?? '').trim().toUpperCase()
  if (estCuenta === 'LIQUIDADA' || estCuenta === 'PAGADA') return repRow

  const { data: pagos, error: eP } = await supabase
    .from('pagosclientes')
    .select('pago')
    .eq('cuenta_id', cuenta.id)
  if (eP) return repRow

  const pagado = sumPagosCuenta(pagos ?? [])
  const totalVenta = Number(cuenta.total ?? 0)

  // Cargos cubiertos: puede estar entregada aunque la cuenta siga PENDIENTE hasta liquidar.
  if (totalVenta > 0.0001 && pagado >= totalVenta - 0.01) return repRow

  // Con cargos en la cuenta: la entrega al cliente es válida aunque falte liquidar o pagar saldo.
  if (totalVenta > 0.0001) return repRow

  // Hay líneas en cuenta/reparación aunque total aún no esté sincronizado.
  const [rCm, rRm] = await Promise.all([
    supabase.from('cuentamov').select('id', { count: 'exact', head: true }).eq('cuenta_id', cuenta.id),
    supabase.from('reparamov').select('id', { count: 'exact', head: true }).eq('repara_id', repRow.id),
  ])
  if ((rCm.count ?? 0) > 0 || (rRm.count ?? 0) > 0) return repRow

  // Solo revertir si quedó ENTREGADA con anticipo pero sin cargos de venta/reparación.
  if (!cuentaTieneSoloAnticipo(totalVenta, pagos ?? [])) return repRow

  const now = new Date().toISOString()
  const patch = {
    estatus: 'INGRESADO',
    fecha_entrega: null,
    verificado_entrega: false,
    fecha_verificacion_entrega: null,
    updated_at: now,
  }
  await actualizarReparacionSupabase(supabase, repRow.id, patch)
  return { ...repRow, ...patch }
}

/** True si la orden entregada no debe revertirse automáticamente (solo lectura, sin escribir BD). */
export function ordenEntregadaProtegidaContraAutoRevert(repRow, cuenta, pagos = []) {
  if (!repRow || !estatusEsEntregado(repRow.estatus)) return false
  if (aYmdLocalDesdeRaw(repRow.fecha_entrega)) return true
  if (!cuenta?.id) return true
  const estCuenta = String(cuenta.estatus ?? '').trim().toUpperCase()
  if (estCuenta === 'LIQUIDADA' || estCuenta === 'PAGADA') return true
  const totalVenta = Number(cuenta.total ?? 0)
  if (totalVenta > 0.0001) return true
  return !cuentaTieneSoloAnticipo(totalVenta, pagos)
}

/** Suma de pagos/anticipos registrados en la cuenta. */
export function sumPagosCuenta(pagosCuenta = []) {
  return (pagosCuenta ?? []).reduce((s, p) => s + Number(p.pago ?? 0), 0)
}

/** Total de cargos (cuenta.total o suma de cuentamov). */
export function totalCargosCuenta(cuenta, movsCuenta = []) {
  const cargosMovs = (movsCuenta ?? []).reduce((s, m) => {
    const line = Number(m.cantidad ?? 0) * Number(m.costo ?? 0)
    return line > 0.0001 ? s + line : s
  }, 0)
  const ct = Math.max(0, Number(cuenta?.total ?? 0))
  return Math.max(ct, cargosMovs)
}

/** Balance neto = cargos − pagos (puede ser negativo = anticipo a favor). */
export function balanceNetoCuenta(totalVenta, pagosCuenta = []) {
  const total = Number(totalVenta ?? 0)
  const pagado = sumPagosCuenta(pagosCuenta)
  return total - pagado
}

/** Adeudo = total de la venta menos lo pagado (mínimo 0). */
export function saldoPendienteCuenta(totalVenta, pagosCuenta = []) {
  return Math.max(0, balanceNetoCuenta(totalVenta, pagosCuenta))
}

/** Hay anticipo registrado pero aún no hay cargos de venta/reparación. */
export function cuentaTieneSoloAnticipo(totalVenta, pagosCuenta = []) {
  const total = Number(totalVenta ?? 0)
  return total <= 0.0001 && sumPagosCuenta(pagosCuenta) > 0.0001
}

/** Monto con signo para UI/PDF (ej. -$300.00). */
export function formatMontoCuenta(value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return '$0.00'
  const abs = Math.abs(v).toFixed(2)
  if (v < -0.0001) return `-$${abs}`
  return `$${abs}`
}

/** True si la fila cuenta existe pero no tiene orden de servicio (repara_id) vinculada. */
export function cuentaSinOrdenVinculada(cuenta) {
  if (!cuenta?.id) return false
  const rid = cuenta.repara_id ?? cuenta.reparacion_id
  return rid == null || String(rid).trim() === ''
}

/**
 * Vincula una cuenta a una orden de servicio (mismo cliente; la orden no debe tener otra cuenta).
 * @returns {Promise<object>} fila cuenta actualizada
 */
export async function vincularCuentaAOrdenSupabase(supabase, cuentaId, reparaId) {
  if (!supabase) throw new Error('Supabase no configurado')
  const cid = Number(cuentaId)
  const rid = Number(reparaId)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('ID de cuenta inválido')
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('Número de orden inválido')

  const { data: rep, error: eRep } = await supabase
    .from('reparaciones')
    .select('id, cliente_id')
    .eq('id', rid)
    .maybeSingle()
  if (eRep) throw eRep
  if (!rep?.id) throw new Error(`No se encontró la orden #${rid}.`)

  const { data: cuenta, error: eCuenta } = await supabase.from('cuentas').select('*').eq('id', cid).maybeSingle()
  if (eCuenta) throw eCuenta
  if (!cuenta?.id) throw new Error(`No se encontró la cuenta #${cid}.`)
  if (!sameId(rep.cliente_id, cuenta.cliente_id)) {
    throw new Error('La cuenta y la orden deben ser del mismo cliente.')
  }

  const { data: otra, error: eOtra } = await supabase
    .from('cuentas')
    .select('id')
    .eq('repara_id', rid)
    .neq('id', cid)
    .limit(1)
  if (eOtra) throw eOtra
  if (otra?.length) {
    throw new Error(`La orden #${rid} ya tiene vinculada la cuenta #${otra[0].id}.`)
  }

  const { data, error } = await supabase
    .from('cuentas')
    .update({ repara_id: rid })
    .eq('id', cid)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/**
 * Total y saldo visibles en listados y ventas.
 * Anticipo sin adeudo: Total negativo (anticipo a favor), Saldo $0.
 */
export function lineasCuentaTienenMovimientos(lineas) {
  return (lineas ?? []).some((l) => {
    const t = l?.tipo
    return t === 'pago' || (t != null && t !== '')
  })
}

/** Suma de subtotales de cargos (excluye pagos) en la UI de cuenta/ventas. */
export function totalCargosDesdeLineasCuenta(lineas) {
  return (lineas ?? [])
    .filter((l) => l.tipo !== 'pago')
    .reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
}

/**
 * Total de cargos a persistir en cuentas.total.
 * Si la UI ya tiene líneas cargadas, confía en ellas (permite bajar total al eliminar cargos).
 */
export function totalVentaSyncDesdeLineas(lineas, cuentaTotalFallback = 0) {
  if (lineasCuentaTienenMovimientos(lineas)) {
    return totalCargosDesdeLineasCuenta(lineas)
  }
  const ct = Number(cuentaTotalFallback ?? 0)
  return ct > 0.0001 ? ct : 0
}

export function totalesVisiblesCuenta(totalCargos, pagosCuenta = []) {
  const cargos = Number(totalCargos ?? 0)
  const balanceNeto = balanceNetoCuenta(cargos, pagosCuenta)
  const saldoAFavor = balanceNeto < -0.0001
  return {
    balanceNeto,
    totalDisplay: saldoAFavor ? balanceNeto : cargos,
    saldoDisplay: saldoAFavor ? 0 : Math.max(0, balanceNeto),
    saldoAFavor,
    saldoPendiente: Math.max(0, balanceNeto),
  }
}

/** Saldo persistido en BD o calculado desde total y pagos. */
export function saldoDesdeCuenta(cuenta, pagosCuenta = []) {
  if (cuenta?.saldo != null && cuenta.saldo !== '' && !Number.isNaN(Number(cuenta.saldo))) {
    return Math.max(0, Number(cuenta.saldo))
  }
  return saldoPendienteCuenta(cuenta?.total, pagosCuenta)
}

function patchTotalesSaldoCuenta(totalVenta, saldo, extras = {}) {
  return {
    total: Number(totalVenta ?? 0),
    saldo: Math.max(0, Number(saldo ?? 0)),
    ...extras,
  }
}

/**
 * Ajusta PENDIENTE / LIQUIDADA según el adeudo real.
 * - Anticipo sin productos: queda PENDIENTE (no se auto-marca liquidada).
 * - Productos después de anticipo: vuelve a PENDIENTE si aún debe.
 * - Solo LIQUIDADA cuando los pagos cubren el total de cargos (> $0).
 */
export async function sincronizarEstatusCuentaPorSaldo(
  supabase,
  cuenta,
  pagosCuenta = [],
  { totalVenta: totalVentaOpt } = {},
) {
  if (!cuenta?.id) return cuenta

  const pagos = pagosCuenta ?? []
  const pagado = sumPagosCuenta(pagos)
  const totalVenta =
    totalVentaOpt != null ? Number(totalVentaOpt) : Number(cuenta.total ?? 0)
  const adeudo = saldoPendienteCuenta(totalVenta, pagos)
  const est = String(cuenta.estatus ?? '').trim().toUpperCase()

  const patchPendiente = patchTotalesSaldoCuenta(totalVenta, adeudo, {
    estatus: 'PENDIENTE',
    fecha_liquidada: null,
  })

  // Hay adeudo (p. ej. agregaron producto tras anticipo o cuenta mal liquidada).
  if (adeudo > 0.01) {
    const saldoDb = saldoDesdeCuenta(cuenta, pagos)
    if (
      est === 'PENDIENTE' &&
      cuenta.fecha_liquidada == null &&
      Math.abs(Number(cuenta.total ?? 0) - totalVenta) < 0.01 &&
      Math.abs(saldoDb - adeudo) < 0.01
    ) {
      return cuenta
    }
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchPendiente)
    }
    return { ...cuenta, ...patchPendiente }
  }

  // Anticipo u otros pagos sin cargos en la cuenta: no cerrar como liquidada.
  if (totalVenta <= 0.0001 && pagado > 0.0001) {
    if (est === 'LIQUIDADA' || cuenta.fecha_liquidada != null) {
      const patchAnticipo = patchTotalesSaldoCuenta(0, 0, {
        estatus: 'PENDIENTE',
        fecha_liquidada: null,
      })
      if (supabase) {
        await actualizarCuentaSupabase(supabase, cuenta.id, patchAnticipo)
      }
      return { ...cuenta, ...patchAnticipo }
    }
    const patchSoloSaldo = patchTotalesSaldoCuenta(0, 0, {
      estatus: 'PENDIENTE',
      fecha_liquidada: null,
    })
    if (supabase && Number(cuenta.saldo ?? -1) !== 0) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchSoloSaldo)
    }
    return { ...cuenta, ...patchSoloSaldo }
  }

  // Pagos cubren el total de cargos.
  const pagosCubrenTotal = totalVenta > 0.0001 && pagado >= totalVenta - 0.01
  if (!pagosCubrenTotal) return cuenta

  // Cuenta pagada pero aún no entregada al cliente (sigue activa hasta liquidar o entregar orden).
  if (est === 'PAGADA') {
    const patchPagada = patchTotalesSaldoCuenta(totalVenta, 0, {
      estatus: 'PAGADA',
      fecha_liquidada: null,
    })
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchPagada)
    }
    return { ...cuenta, ...patchPagada }
  }

  // Ya liquidada: conservar total y saldo $0.
  if (est === 'LIQUIDADA') {
    const nowLiq = new Date().toISOString()
    const patchLiq = patchTotalesSaldoCuenta(totalVenta, 0, {
      estatus: 'LIQUIDADA',
      fecha_liquidada: cuenta.fecha_liquidada ?? nowLiq,
      updated_at: nowLiq,
    })
    const totalDesactualizado = Math.abs(Number(cuenta.total ?? 0) - totalVenta) > 0.01
    const saldoDesactualizado = Math.abs(saldoDesdeCuenta(cuenta, pagos)) > 0.01
    if (!totalDesactualizado && !saldoDesactualizado) {
      return { ...cuenta, ...patchLiq }
    }
    if (supabase) {
      await actualizarCuentaSupabase(supabase, cuenta.id, patchLiq)
    }
    return { ...cuenta, ...patchLiq }
  }

  // PENDIENTE con pagos completos: solo sincroniza saldo; no auto-liquida (el usuario elige en ventas).
  const patchSoloSaldo = patchTotalesSaldoCuenta(totalVenta, 0, {
    estatus: 'PENDIENTE',
    fecha_liquidada: null,
  })
  if (supabase) {
    await actualizarCuentaSupabase(supabase, cuenta.id, patchSoloSaldo)
  }
  return { ...cuenta, ...patchSoloSaldo }
}

/** Cuenta pagada en su total pero aún no liquidada (cliente no ha recogido, etc.). */
export function estatusEsCuentaPagadaActiva(estatus) {
  return String(estatus ?? '').trim().toUpperCase() === 'PAGADA'
}

/** Marca la cuenta como pagada (saldo $0) sin liquidar ni cerrar la orden. */
export async function aplicarCuentaPagadaActiva(
  supabase,
  cuenta,
  pagosCuenta = [],
  { totalVenta: totalVentaOpt } = {},
) {
  if (!cuenta?.id) return cuenta
  const pagos = pagosCuenta ?? []
  const totalVenta =
    totalVentaOpt != null ? Number(totalVentaOpt) : Number(cuenta.total ?? 0)
  const patch = patchTotalesSaldoCuenta(totalVenta, 0, {
    estatus: 'PAGADA',
    fecha_liquidada: null,
    updated_at: new Date().toISOString(),
  })
  if (supabase) {
    await actualizarCuentaSupabase(supabase, cuenta.id, patch)
  }
  return { ...cuenta, ...patch }
}

/** Al marcar la orden ENTREGADA, cierra cuentas que quedaron en PAGADA con saldo $0. */
export async function liquidarCuentaPagadaAlEntregarOrden(supabase, reparaId) {
  if (!supabase || reparaId == null) return null
  const rid = Number(reparaId)
  if (!Number.isFinite(rid) || rid <= 0) return null
  const { data: cuentas, error } = await supabase.from('cuentas').select('*').eq('repara_id', rid)
  if (error) throw error
  const lista = cuentas ?? []
  if (!lista.length) return null
  let cuenta = lista[0]
  for (const c of lista) {
    const tNew = new Date(c.updated_at ?? c.created_at ?? 0).getTime()
    const tPrev = new Date(cuenta.updated_at ?? cuenta.created_at ?? 0).getTime()
    if (tNew >= tPrev) cuenta = c
  }
  if (!estatusEsCuentaPagadaActiva(cuenta.estatus)) return cuenta
  const { data: pagos, error: ePag } = await supabase
    .from('pagosclientes')
    .select('*')
    .eq('cuenta_id', cuenta.id)
  if (ePag) throw ePag
  const totalVenta = Number(cuenta.total ?? 0)
  if (saldoPendienteCuenta(totalVenta, pagos ?? []) > 0.01) return cuenta
  const nowLiq = new Date().toISOString()
  const patch = patchTotalesSaldoCuenta(totalVenta, 0, {
    estatus: 'LIQUIDADA',
    fecha_liquidada: cuenta.fecha_liquidada ?? nowLiq,
    updated_at: nowLiq,
  })
  await actualizarCuentaSupabase(supabase, cuenta.id, patch)
  return { ...cuenta, ...patch }
}

/** @deprecated Alias; usa {@link sincronizarEstatusCuentaPorSaldo}. */
export async function sincronizarCuentaLiquidadaSiSaldoCero(
  supabase,
  cuenta,
  _reparaId = null,
  pagosCuenta = [],
  opts = {},
) {
  return sincronizarEstatusCuentaPorSaldo(supabase, cuenta, pagosCuenta, opts)
}

/** UPDATE en cuentas; reintenta sin columnas opcionales (fecha_liquidada, updated_at). */
export async function actualizarCuentaSupabase(supabase, cuentaId, patch) {
  let payload = { ...patch }
  const marcaLiquidada =
    String(patch.estatus ?? '').trim().toUpperCase() === 'LIQUIDADA'
  for (let intento = 0; intento < 6; intento += 1) {
    const { error } = await supabase.from('cuentas').update(payload).eq('id', cuentaId)
    if (!error) {
      if (marcaLiquidada) {
        try {
          await entregarOrdenVinculadaSiCuentaLiquidada(supabase, cuentaId)
        } catch (e) {
          console.warn('No se pudo marcar orden entregada al liquidar cuenta:', e?.message ?? e)
        }
      }
      return
    }
    const msg = String(error.message ?? '').toLowerCase()
    if (msg.includes('permission') || msg.includes('row-level security') || msg.includes('rls')) {
      throw new Error(
        'No tiene permiso para actualizar esta cuenta. Revise la sesión de Supabase o las políticas RLS.',
      )
    }
    if (payload.fecha_liquidada != null && esErrorColumnaDesconocida(error, 'fecha_liquidada')) {
      const { fecha_liquidada: _f, ...rest } = payload
      payload = rest
      continue
    }
    if (payload.updated_at != null && esErrorColumnaDesconocida(error, 'updated_at')) {
      const { updated_at: _u, ...rest } = payload
      payload = rest
      continue
    }
    if (payload.saldo != null && esErrorColumnaDesconocida(error, 'saldo')) {
      const { saldo: _s, ...rest } = payload
      payload = rest
      continue
    }
    throw error
  }
  throw new Error('No se pudo actualizar la cuenta tras varios intentos.')
}

/** Elimina cuenta y dependencias (Supabase RPC o localStorage). */
export async function eliminarCuentaCompleta(supabase, cuentaId, ls = null) {
  const cid = normalizarReparacionId(cuentaId)
  if (cid == null) throw new Error('ID de cuenta inválido.')

  if (supabase) {
    const { error } = await supabase.rpc('eliminar_cuenta_por_id', { p_cuenta_id: cid })
    if (error) {
      const { rpcNoExiste, eliminarCuentaSupabaseCascada } = await import('./supabaseDeleteUtils.js')
      if (!rpcNoExiste(error)) throw error
      await eliminarCuentaSupabaseCascada(supabase, cid)
    }
    return
  }

  const LS_CUENTAS = ls?.cuentas ?? 'sistefix_local_cuentas'
  const LS_PAGOS = ls?.pagos ?? 'sistefix_local_pagosclientes'
  const LS_CUENTAMOV = ls?.cuentamov ?? 'sistefix_local_cuentamov'
  const LS_REPARAMOV = ls?.reparamov ?? 'sistefix_local_reparamov'

  const readLs = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
    } catch {
      return fallback
    }
  }
  const writeLs = (key, data) => localStorage.setItem(key, JSON.stringify(data))

  const cuentas = readLs(LS_CUENTAS, [])
  const cuenta = cuentas.find((c) => Number(c.id) === cid)
  const reparaId = cuenta?.repara_id != null ? Number(cuenta.repara_id) : null

  writeLs(
    LS_PAGOS,
    readLs(LS_PAGOS, []).filter((p) => Number(p.cuenta_id) !== cid),
  )
  writeLs(
    LS_CUENTAMOV,
    readLs(LS_CUENTAMOV, []).filter((m) => Number(m.cuenta_id) !== cid),
  )
  if (reparaId != null && Number.isFinite(reparaId)) {
    writeLs(
      LS_REPARAMOV,
      readLs(LS_REPARAMOV, []).filter((m) => Number(m.repara_id) !== reparaId),
    )
  }
  writeLs(
    LS_CUENTAS,
    cuentas.filter((c) => Number(c.id) !== cid),
  )
}

/** Elimina orden de servicio, cuenta vinculada y movimientos. */
export async function eliminarReparacionCompleta(supabase, reparaId, ls = null) {
  const rid = normalizarReparacionId(reparaId)
  if (rid == null) throw new Error('ID de orden inválido.')

  if (supabase) {
    const { error } = await supabase.rpc('eliminar_reparacion_completa', { p_repara_id: rid })
    if (error) {
      const { rpcNoExiste, eliminarReparacionSupabaseCascada } = await import('./supabaseDeleteUtils.js')
      if (!rpcNoExiste(error)) throw error
      await eliminarReparacionSupabaseCascada(supabase, rid)
    }
    return
  }

  const LS_CUENTAS = ls?.cuentas ?? 'sistefix_local_cuentas'
  const LS_PAGOS = ls?.pagos ?? 'sistefix_local_pagosclientes'
  const LS_CUENTAMOV = ls?.cuentamov ?? 'sistefix_local_cuentamov'
  const LS_REPARAMOV = ls?.reparamov ?? 'sistefix_local_reparamov'
  const LS_REP = ls?.reparaciones ?? 'sistefix_local_reparaciones'

  const readLs = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
    } catch {
      return fallback
    }
  }
  const writeLs = (key, data) => localStorage.setItem(key, JSON.stringify(data))

  const cuentasIds = readLs(LS_CUENTAS, [])
    .filter((c) => Number(c.repara_id) === rid)
    .map((c) => c.id)

  if (cuentasIds.length > 0) {
    writeLs(
      LS_PAGOS,
      readLs(LS_PAGOS, []).filter((p) => !cuentasIds.some((cid) => Number(p.cuenta_id) === Number(cid))),
    )
    writeLs(
      LS_CUENTAMOV,
      readLs(LS_CUENTAMOV, []).filter((m) => !cuentasIds.some((cid) => Number(m.cuenta_id) === Number(cid))),
    )
    writeLs(
      LS_CUENTAS,
      readLs(LS_CUENTAS, []).filter((c) => Number(c.repara_id) !== rid),
    )
  }
  writeLs(
    LS_REPARAMOV,
    readLs(LS_REPARAMOV, []).filter((m) => Number(m.repara_id) !== rid),
  )
  writeLs(
    LS_REP,
    readLs(LS_REP, []).filter((r) => Number(r.id) !== rid),
  )
}

/** Reparación aún en taller (no entregada). */
export function isReparacionActiva(rep) {
  return !estatusEsEntregado(rep?.estatus)
}

/** Orden marcada manualmente como duplicada accidental. */
export function esOrdenDuplicada(rep) {
  return rep?.es_orden_duplicada === true || rep?.es_orden_duplicada === 1
}

/** Supabase/PostgREST cuando la migración `es_orden_duplicada` aún no está aplicada. */
export function esErrorColumnaEsOrdenDuplicada(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase()
  const code = String(error?.code ?? '')
  if (code === 'PGRST204' || code === '42703') {
    return msg.includes('es_orden_duplicada') || msg.includes('duplicad')
  }
  return (
    msg.includes('es_orden_duplicada') ||
    (msg.includes('column') && msg.includes('duplicad'))
  )
}

/** Quita el campo opcional antes de INSERT si la columna no existe en la BD. */
export function filaReparacionSinCampoDuplicada(row) {
  if (!row || typeof row !== 'object') return row
  const { es_orden_duplicada: _omit, ...rest } = row
  return rest
}

/**
 * Inserta en `reparaciones`. Si la columna es_orden_duplicada no existe, reintenta sin ese campo.
 */
export async function insertarReparacionSupabase(supabase, row) {
  let payload = { ...row }
  for (let intento = 0; intento < 6; intento += 1) {
    const first = await supabase.from('reparaciones').insert(payload).select('id').single()
    if (!first.error) return first.data
    if (esErrorColumnaEsOrdenDuplicada(first.error)) {
      payload = filaReparacionSinCampoDuplicada(payload)
      continue
    }
    if ('fecha_ingreso' in payload && esErrorColumnaDesconocida(first.error, 'fecha_ingreso')) {
      const { fecha_ingreso: _f, ...rest } = payload
      payload = rest
      continue
    }
    if ('fecha_revision' in payload && esErrorColumnaDesconocida(first.error, 'fecha_revision')) {
      const { fecha_revision: _f, ...rest } = payload
      payload = rest
      continue
    }
    if ('fecha_reparado' in payload && esErrorColumnaDesconocida(first.error, 'fecha_reparado')) {
      const { fecha_reparado: _f, ...rest } = payload
      payload = rest
      continue
    }
    if ('fecha_sin_reparacion' in payload && esErrorColumnaDesconocida(first.error, 'fecha_sin_reparacion')) {
      const { fecha_sin_reparacion: _f, ...rest } = payload
      payload = rest
      continue
    }
    if ('bitacora' in payload && esErrorColumnaDesconocida(first.error, 'bitacora')) {
      const { bitacora: _b, ...rest } = payload
      payload = rest
      continue
    }
    if ('verificado_entrega' in payload && esErrorColumnaDesconocida(first.error, 'verificado_entrega')) {
      const { verificado_entrega: _v, fecha_verificacion_entrega: _f, ...rest } = payload
      payload = rest
      continue
    }
    throw first.error
  }
  throw new Error('No se pudo insertar la orden tras varios intentos.')
}

const LS_INSERT_LOCK = 'sistefix_rep_insert_lock'
const LS_LAST_CREATED = 'sistefix_rep_last_created'

/** Promesa de inserción en curso (una sola a la vez en toda la app). */
let promesaInsercionOrden = null

/**
 * Ejecuta el guardado de una orden nueva de forma exclusiva.
 * Si el usuario hace doble clic (o React remonta), reutiliza la misma promesa.
 */
export function ejecutarInsercionOrdenUnica(ejecutar) {
  if (promesaInsercionOrden) {
    return promesaInsercionOrden
  }
  promesaInsercionOrden = Promise.resolve()
    .then(() => ejecutar())
    .finally(() => {
      promesaInsercionOrden = null
    })
  return promesaInsercionOrden
}

export function hayInsercionOrdenEnCurso() {
  return promesaInsercionOrden != null
}

/** Bloqueo entre pestañas solo mientras dura el guardado (no minutos después). */
export function iniciarBloqueoInsercionPestana() {
  try {
    const raw = sessionStorage.getItem(LS_INSERT_LOCK)
    if (raw) {
      const { inProgress, ts } = JSON.parse(raw)
      if (inProgress && Date.now() - Number(ts) < 90_000) return false
    }
    sessionStorage.setItem(
      LS_INSERT_LOCK,
      JSON.stringify({ inProgress: true, ts: Date.now() }),
    )
    return true
  } catch {
    return true
  }
}

export function finalizarBloqueoInsercionPestana() {
  try {
    sessionStorage.removeItem(LS_INSERT_LOCK)
  } catch {
    /* ignore */
  }
}

export function registrarOrdenCreadaEnSesion(id) {
  try {
    sessionStorage.setItem(
      LS_LAST_CREATED,
      JSON.stringify({ id: Number(id), ts: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

/** ID de orden creada hace poco en esta pestaña (evita segundo INSERT tras remount). */
/** Texto de equipo para comprobante (tipo + descripción de la orden). */
export function descripcionEquipoParaRecibo(reparacion, equipo) {
  const tipo = String(equipo?.tipo_equipo ?? '').trim()
  const desc = String(reparacion?.descripcion_equipo ?? equipo?.descripcion ?? '').trim()
  if (tipo && desc) {
    if (desc.toLowerCase().startsWith(tipo.toLowerCase())) return desc
    return `${tipo} ${desc}`
  }
  return tipo || desc
}

export function leerOrdenRecienCreadaEnSesion(maxEdadMs = 120_000) {
  try {
    const raw = sessionStorage.getItem(LS_LAST_CREATED)
    if (!raw) return null
    const { id, ts } = JSON.parse(raw)
    if (Date.now() - Number(ts) > maxEdadMs) return null
    const n = Number(id)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}
