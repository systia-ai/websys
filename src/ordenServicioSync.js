import { sameId } from './clienteUtils.js'
import { fetchAllRows } from './supabaseFetchAll.js'

export function normalizarSerieEquipo(serie) {
  return String(serie ?? '').trim().toUpperCase()
}

function coincideSerie(row, serieNorm, excluirId) {
  return (
    normalizarSerieEquipo(row?.serie) === serieNorm &&
    (excluirId == null || !sameId(row.id, excluirId))
  )
}

async function cargarEquipoPorId(supabase, equipoId, { readLs, LS_EQUIPOS }) {
  if (equipoId == null) return null
  if (supabase?.from) {
    const { data, error } = await supabase.from('equipos').select('*').eq('id', equipoId).maybeSingle()
    if (error) throw error
    return data
  }
  return (readLs?.(LS_EQUIPOS, []) ?? []).find((e) => sameId(e.id, equipoId)) ?? null
}

async function listarEquiposPorSerie(supabase, serieNorm, { readLs, LS_EQUIPOS }) {
  if (!serieNorm) return []
  if (supabase?.from) {
    const { data, error } = await supabase
      .from('equipos')
      .select('id, serie, cliente_id')
      .eq('serie', serieNorm)
    if (error) throw error
    let rows = (data ?? []).filter((x) => coincideSerie(x, serieNorm, null))
    if (rows.length === 0) {
      const all = await fetchAllRows(() =>
        supabase.from('equipos').select('id, serie, cliente_id').order('id', { ascending: true }),
      )
      rows = all.filter((x) => coincideSerie(x, serieNorm, null))
    }
    return rows
  }
  return (readLs?.(LS_EQUIPOS, []) ?? []).filter((x) => coincideSerie(x, serieNorm, null))
}

/** El equipo de la sesión si ya trae esa serie; si no, el del mismo cliente; si no, el más antiguo. */
function elegirEquipoRegistrado(rows, { preferirId = null, clienteId = null } = {}) {
  if (!rows?.length) return null
  if (preferirId != null) {
    const preferido = rows.find((r) => sameId(r.id, preferirId))
    if (preferido) return preferido
  }
  if (clienteId != null && clienteId !== '') {
    const delCliente = rows.find((r) => sameId(r.cliente_id, clienteId))
    if (delCliente) return delCliente
  }
  return [...rows].sort((a, b) => Number(a.id) - Number(b.id))[0]
}

/**
 * Resuelve el equipo para una orden nueva.
 * Si la serie ya está registrada, usa ese equipo y no modifica su serie.
 * Solo actualiza la serie del equipo de la sesión cuando el valor nuevo no pertenece a otro equipo.
 */
export async function sincronizarEquipoParaOrden(
  supabase,
  {
    equipoId = null,
    serie,
    tipo_equipo,
    descripcion,
    tipo_reparacion,
    clienteId = null,
    readLs,
    writeLs,
    LS_EQUIPOS = 'sistefix_local_equipos',
  },
) {
  const serieNorm = normalizarSerieEquipo(serie)
  if (!serieNorm && (equipoId == null || equipoId === '')) {
    return { id: null, error: 'La serie del equipo es requerida.' }
  }

  let row = equipoId != null ? await cargarEquipoPorId(supabase, equipoId, { readLs, LS_EQUIPOS }) : null
  const serieYaEsDeEsteEquipo = row != null && normalizarSerieEquipo(row.serie) === serieNorm
  let usoEquipoYaRegistrado = false

  if (serieNorm && !serieYaEsDeEsteEquipo) {
    const coincidencias = await listarEquiposPorSerie(supabase, serieNorm, { readLs, LS_EQUIPOS })
    const registrado = elegirEquipoRegistrado(coincidencias, {
      preferirId: row?.id ?? null,
      clienteId,
    })
    if (registrado && (!row || !sameId(row.id, registrado.id))) {
      const completo = await cargarEquipoPorId(supabase, registrado.id, { readLs, LS_EQUIPOS })
      if (completo) {
        usoEquipoYaRegistrado = equipoId != null && !sameId(completo.id, equipoId)
        row = completo
      }
    }
  }

  if (!row) {
    return {
      id: null,
      error: serieNorm
        ? `No se encontró el equipo con serie "${serieNorm}". Regístrelo en Equipos o corrija la serie.`
        : 'No se encontró el equipo vinculado a esta orden.',
    }
  }

  const patch = {
    serie: serieNorm || normalizarSerieEquipo(row.serie),
    tipo_equipo: String(tipo_equipo ?? row.tipo_equipo ?? '').trim().toUpperCase() || null,
    descripcion: descripcion != null && String(descripcion).trim()
      ? String(descripcion).trim().toUpperCase()
      : row.descripcion ?? null,
    tipo_reparacion:
      tipo_reparacion != null && String(tipo_reparacion).trim()
        ? String(tipo_reparacion).trim().toUpperCase()
        : row.tipo_reparacion ?? null,
  }

  const cambio =
    normalizarSerieEquipo(row.serie) !== patch.serie ||
    String(row.tipo_equipo ?? '').trim().toUpperCase() !== String(patch.tipo_equipo ?? '').trim().toUpperCase() ||
    String(row.descripcion ?? '').trim().toUpperCase() !== String(patch.descripcion ?? '').trim().toUpperCase() ||
    String(row.tipo_reparacion ?? '').trim().toUpperCase() !==
      String(patch.tipo_reparacion ?? '').trim().toUpperCase()

  if (cambio && !usoEquipoYaRegistrado) {
    if (supabase?.from) {
      const { error } = await supabase.from('equipos').update(patch).eq('id', row.id)
      if (error) throw error
    } else if (writeLs && readLs) {
      const list = readLs(LS_EQUIPOS, [])
      writeLs(
        LS_EQUIPOS,
        list.map((e) => (sameId(e.id, row.id) ? { ...e, ...patch } : e)),
      )
    }
  }

  return { id: row.id, error: null }
}
