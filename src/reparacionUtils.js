/** True si la orden ya salió del taller (entregada al cliente). */
export function estatusEsEntregado(estatus) {
  return /ENTREGAD[OA]\b/i.test(String(estatus ?? '').trim())
}

/** Reparación aún en taller (no entregada). */
export function isReparacionActiva(rep) {
  return !estatusEsEntregado(rep?.estatus)
}

/** Orden marcada manualmente como duplicada accidental. */
export function esOrdenDuplicada(rep) {
  return rep?.es_orden_duplicada === true || rep?.es_orden_duplicada === 1
}

const LS_INSERT_LOCK = 'sistefix_rep_insert_lock'
const LS_LAST_CREATED = 'sistefix_rep_last_created'

/** Bloqueo global en sessionStorage (sobrevive remontajes de React / doble clic). */
export function adquirirBloqueoInsercionOrden(maxEdadMs = 120_000) {
  try {
    const raw = sessionStorage.getItem(LS_INSERT_LOCK)
    if (raw) {
      const { ts } = JSON.parse(raw)
      if (Date.now() - Number(ts) < maxEdadMs) return false
    }
    sessionStorage.setItem(LS_INSERT_LOCK, JSON.stringify({ ts: Date.now() }))
    return true
  } catch {
    return true
  }
}

export function liberarBloqueoInsercionOrden() {
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
