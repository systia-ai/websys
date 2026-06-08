import { TIPOS_REPARACION } from './catalogos.js'

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
    return 'El equipo debe estar En Revisión antes de ser reparado.'
  }
  if (d === 'INGRESADO' && h === 'ENTREGADO') {
    return 'El equipo debe pasar por En Revisión y Reparado antes de ser entregado.'
  }
  if (d === 'EN REVISION' && h === 'ENTREGADO') {
    return 'El equipo debe estar Reparado antes de ser entregado.'
  }
  if (siguiente) {
    return `El siguiente estatus permitido es ${siguiente}. No puede saltar etapas del proceso.`
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

/** Solo en REPARADO se puede marcar verificación antes de ENTREGADO. */
export function estatusPermiteVerificacionEntrega(estatus) {
  return estatusEsReparado(estatus)
}

export const MENSAJE_VERIFICAR_ANTES_ENTREGADO =
  'Debe verificar el equipo antes de marcar la orden como ENTREGADO. Use el botón «Verificar listo para entrega».'

/** Bloquea ENTREGADO si la orden está REPARADA y aún no se verificó el equipo. */
export function bloqueaEntregaSinVerificacion(estatusActual, verificado) {
  return estatusEsReparado(estatusActual) && !verificado
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
export async function guardarVerificacionEntregaSupabase(supabase, reparaId, verificado, patchExtra = {}) {
  let payload = { ...patchVerificadoEntrega(verificado), ...patchExtra }
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

/** Fecha de ingreso al taller. */
export function fechaIngresoYmd(rep) {
  const raw =
    rep?.fecha_ingreso ??
    rep?.fechaIngreso ??
    rep?.fecha_registro ??
    rep?.fecha_creacion ??
    rep?.created_at ??
    rep?.fecha
  return aYmdLocalDesdeRaw(raw)
}

/**
 * Fecha de entrega (órdenes ENTREGADO/A).
 * Prioridad: columna fecha_entrega → último pago → fecha_liquidada → updated_at de la orden.
 * No usa created_at de la cuenta (coincide con el ingreso al taller).
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
  return aYmdLocalDesdeRaw(rep?.updated_at)
}

/** YMD para guardar al marcar entregada: conserva la existente o usa hoy (local). */
export function ymdFechaEntregaParaGuardar(fechaEntregaExistente) {
  return aYmdLocalDesdeRaw(fechaEntregaExistente) || ymdHoyLocal()
}

/** Fecha en que la orden pasó a EN REVISION. */
export function fechaRevisionYmd(rep) {
  return aYmdLocalDesdeRaw(rep?.fecha_revision ?? rep?.fechaRevision)
}

/** Fecha en que la orden pasó a REPARADO. */
export function fechaReparadoYmd(rep) {
  return aYmdLocalDesdeRaw(rep?.fecha_reparado ?? rep?.fechaReparado)
}

/**
 * Graba fecha_revision / fecha_reparado la primera vez que entra a ese estatus.
 * No borra fechas históricas al cambiar a otro estatus.
 */
export function patchFechasHitosEstatus(estatusNuevo, repActual = {}) {
  const patch = {}
  const hoy = ymdFechaEntregaParaGuardar(null)
  if (estatusEsIngresado(estatusNuevo) && !fechaIngresoYmd(repActual)) {
    patch.fecha_ingreso = hoy
  }
  if (estatusEsEnRevision(estatusNuevo) && !fechaRevisionYmd(repActual)) {
    patch.fecha_revision = hoy
  }
  if (estatusEsReparado(estatusNuevo) && !fechaReparadoYmd(repActual)) {
    patch.fecha_reparado = hoy
  }
  return patch
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

/** Estatus cuyo rango de fechas en el monitor puede usar también `updated_at` (p. ej. reparadas hoy). */
const ESTATUS_RANGO_USA_ACTUALIZACION = new Set([
  'REPARADO',
  'EN REVISION',
  'EN ESPERA POR REFACCION',
  'SIN REPARACION',
])

/** Máx. días entre ingreso y actualización para contar `updated_at` en el filtro por mes. */
const DIAS_MAX_INGRESO_VS_ACTUALIZACION_MONITOR = 90

function diasEntreYmd(a, b) {
  if (!a || !b || a.length < 10 || b.length < 10) return null
  const [ya, ma, da] = a.slice(0, 10).split('-').map(Number)
  const [yb, mb, db] = b.slice(0, 10).split('-').map(Number)
  const ta = Date.UTC(ya, ma - 1, da)
  const tb = Date.UTC(yb, mb - 1, db)
  return Math.round(Math.abs(tb - ta) / 86400000)
}

/**
 * Fechas que cuentan para el rango del monitor (ingreso, entrega y/o última actualización).
 */
export function fechasRangoMonitor(rep, cuentaVinculada = null, ymdDesdePagos = null) {
  const ing = fechaIngresoYmd(rep)
  const ent = fechaEntregaYmd(rep, cuentaVinculada, ymdDesdePagos)
  const rev = fechaRevisionYmd(rep)
  const repa = fechaReparadoYmd(rep)
  const st = normalizarEstatusOrden(rep?.estatus)
  const fechas = []
  if (ing) fechas.push(ing)
  if (rev) fechas.push(rev)
  if (repa) fechas.push(repa)
  if (ent) fechas.push(ent)
  if (ESTATUS_RANGO_USA_ACTUALIZACION.has(st)) {
    const act = aYmdLocalDesdeRaw(rep?.updated_at)
    if (act && !fechas.includes(act)) {
      const dias = ing ? diasEntreYmd(ing, act) : null
      if (
        !ing ||
        (dias != null && dias <= DIAS_MAX_INGRESO_VS_ACTUALIZACION_MONITOR)
      ) {
        fechas.push(act)
      }
    }
  }
  return fechas
}

/**
 * Rango Desde/Hasta del monitor.
 * @param {'todas'|'ingreso'|'entrega'|'ambas'} modo
 */
export function repEnRangoFechasMonitor(
  rep,
  desde,
  hasta,
  cuentaVinculada = null,
  ymdDesdePagos = null,
  modo = 'ingreso',
) {
  if (modo === 'todas') return true
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  if (!d && !h) return true
  const ing = fechaIngresoYmd(rep)
  const ent = fechaEntregaYmd(rep, cuentaVinculada, ymdDesdePagos)
  if (modo === 'ingreso') return ymdEnRango(ing, d, h)
  if (modo === 'entrega') return ymdEnRango(ent, d, h)
  const fechas = fechasRangoMonitor(rep, cuentaVinculada, ymdDesdePagos)
  if (fechas.length === 0) return false
  return fechas.some((ymd) => ymdEnRango(ymd, d, h))
}

/**
 * ¿La orden cumple el filtro del monitor?
 * - `modoFecha` 'ingreso' | 'entrega': usa el rango superior y omite estatus.
 * - `modoFecha` 'verificadas': órdenes verificadas y aún no entregadas; el rango aplica a fecha_verificacion_entrega.
 * - Sin `modoFecha`: filtra por estatus y, si hay rango, por ingreso o entrega (ambas).
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
  const d = String(desde ?? '').trim()
  const h = String(hasta ?? '').trim()
  const hayRango = Boolean(d || h)

  if (modoFecha === 'ingreso' || modoFecha === 'entrega') {
    if (!hayRango) return false
    if (modoFecha === 'entrega' && !estatusEsEntregado(rep?.estatus)) return false
    return repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, modoFecha)
  }

  if (modoFecha === 'verificadas') {
    if (!repEsVerificadaListaEntrega(rep)) return false
    if (!hayRango) return true
    const ymdVer = fechaVerificacionEntregaYmd(rep)
    if (ymdVer) return ymdEnRango(ymdVer, d, h)
    const ymdAct = aYmdLocalDesdeRaw(rep?.updated_at)
    if (ymdAct) return ymdEnRango(ymdAct, d, h)
    return true
  }

  const sel = estatusSeleccionados
  const st = estatusParaFiltroFn(rep)
  if (sel.size === 0 || !sel.has(st)) return false
  if (!hayRango) return true
  return repEnRangoFechasMonitor(rep, d, h, cuentaVinculada, ymdDesdePagos, 'ambas')
}

/** Campos al marcar orden entregada (Ventas / actualización de estatus). */
export function patchReparacionEntregada(estatus = 'ENTREGADA', fechaEntregaExistente = null) {
  const now = new Date().toISOString()
  return {
    estatus,
    updated_at: now,
    fecha_entrega: ymdFechaEntregaParaGuardar(fechaEntregaExistente),
  }
}

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

/** Actualiza reparación a entregada; conserva fecha_entrega ya guardada. */
export async function marcarReparacionEntregadaSupabase(supabase, reparaId) {
  let fechaPrev = null
  if (supabase?.from && reparaId != null) {
    const { data } = await supabase
      .from('reparaciones')
      .select('fecha_entrega')
      .eq('id', reparaId)
      .maybeSingle()
    fechaPrev = data?.fecha_entrega ?? null
  }
  await actualizarReparacionSupabase(supabase, reparaId, patchReparacionEntregada('ENTREGADA', fechaPrev))
}

/**
 * Reparación marcada ENTREGADA/ENTREGADO por error (cuenta aún PENDIENTE y sin pagos).
 * Corrige en BD a INGRESADO y quita fecha_entrega.
 */
export async function corregirEntregadaIndebidaSiAplica(supabase, repRow) {
  if (!supabase?.from || !repRow?.id || !estatusEsEntregado(repRow.estatus)) {
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

  // Cargos cubiertos: la orden puede estar entregada aunque la cuenta siga PENDIENTE hasta liquidar.
  if (totalVenta > 0.0001 && pagado >= totalVenta - 0.01) return repRow

  // Solo anticipo, sin cargos, o cuenta abierta: el equipo no debe figurar como entregado.
  const now = new Date().toISOString()
  const patch = { estatus: 'INGRESADO', fecha_entrega: null, updated_at: now }
  await actualizarReparacionSupabase(supabase, repRow.id, patch)
  return { ...repRow, ...patch }
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

/**
 * Total y saldo visibles en listados y ventas.
 * Anticipo sin adeudo: Total negativo (anticipo a favor), Saldo $0.
 */
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
  for (let intento = 0; intento < 6; intento += 1) {
    const { error } = await supabase.from('cuentas').update(payload).eq('id', cuentaId)
    if (!error) return
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
