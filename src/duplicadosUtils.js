function normalizarTextoBase(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarSerie(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

function tokensTexto(s) {
  return normalizarTextoBase(s)
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean)
}

function coincideTextoSimilar(a, b) {
  const na = normalizarTextoBase(a)
  const nb = normalizarTextoBase(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ta = new Set(tokensTexto(na))
  const tb = new Set(tokensTexto(nb))
  let comunes = 0
  for (const t of ta) {
    if (tb.has(t) && t.length >= 3) comunes += 1
  }
  return comunes >= 2
}

function coincideTelefono(a, b) {
  const da = String(a ?? '').replace(/\D/g, '')
  const db = String(b ?? '').replace(/\D/g, '')
  if (!da || !db) return false
  return da === db
}

export function buscarClientesSimilares(clientes = [], { nombre = '', telefono = '', excludeId = null } = {}) {
  const out = []
  for (const c of clientes) {
    if (excludeId != null && String(c?.id) === String(excludeId)) continue
    const nombreActual = String(c?.nombre ?? '')
    const telefonoActual = String(c?.telefono ?? '')
    const scoreNombre = coincideTextoSimilar(nombreActual, nombre)
    const scoreTel = coincideTelefono(telefonoActual, telefono)
    if (!scoreNombre && !scoreTel) continue
    out.push({
      id: c?.id ?? null,
      nombre: nombreActual,
      telefono: telefonoActual,
      score: (scoreNombre ? 2 : 0) + (scoreTel ? 1 : 0),
    })
  }
  return out.sort((a, b) => b.score - a.score || String(a.nombre).localeCompare(String(b.nombre), 'es'))
}

export function buscarEquiposSimilares(
  equipos = [],
  { serie = '', tipoEquipo = '', descripcion = '', excludeId = null } = {},
) {
  const serieNorm = normalizarTextoBase(serie)
  const tipoNorm = normalizarTextoBase(tipoEquipo)
  const descNorm = normalizarTextoBase(descripcion)
  const out = []
  for (const e of equipos) {
    if (excludeId != null && String(e?.id) === String(excludeId)) continue
    const serieActual = String(e?.serie ?? '')
    const tipoActual = String(e?.tipo_equipo ?? '')
    const descActual = String(e?.descripcion ?? '')
    const serieEq = serieNorm && normalizarTextoBase(serieActual) === serieNorm
    const tipoEq = coincideTextoSimilar(tipoActual, tipoNorm)
    const descEq = coincideTextoSimilar(descActual, descNorm)
    if (!serieEq && !(tipoEq && descEq)) continue
    out.push({
      id: e?.id ?? null,
      serie: serieActual,
      tipo_equipo: tipoActual,
      descripcion: descActual,
      score: (serieEq ? 3 : 0) + (tipoEq ? 1 : 0) + (descEq ? 1 : 0),
    })
  }
  return out.sort((a, b) => b.score - a.score || String(a.serie).localeCompare(String(b.serie), 'es'))
}

export function buscarEquiposPorSerieExacta(equipos = [], { serie = '', excludeId = null } = {}) {
  const objetivo = normalizarSerie(serie)
  if (!objetivo) return []
  const out = []
  for (const e of equipos) {
    if (excludeId != null && String(e?.id) === String(excludeId)) continue
    const actual = normalizarSerie(e?.serie)
    if (!actual || actual !== objetivo) continue
    out.push({
      id: e?.id ?? null,
      serie: String(e?.serie ?? ''),
      tipo_equipo: String(e?.tipo_equipo ?? ''),
      descripcion: String(e?.descripcion ?? ''),
    })
  }
  return out
}
