import { sameId } from './clienteUtils.js'

export function normalizarSerieEquipo(serie) {
  return String(serie ?? '').trim().toUpperCase()
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

async function buscarEquipoPorSerie(supabase, serieNorm, excluirId, { readLs, LS_EQUIPOS }) {
  if (!serieNorm) return null
  if (supabase?.from) {
    const { data, error } = await supabase.from('equipos').select('id, serie')
    if (error) throw error
    return (
      (data ?? []).find(
        (x) =>
          normalizarSerieEquipo(x.serie) === serieNorm &&
          (excluirId == null || !sameId(x.id, excluirId)),
      ) ?? null
    )
  }
  return (
    (readLs?.(LS_EQUIPOS, []) ?? []).find(
      (x) =>
        normalizarSerieEquipo(x.serie) === serieNorm &&
        (excluirId == null || !sameId(x.id, excluirId)),
    ) ?? null
  )
}

/**
 * Resuelve el equipo para una orden nueva: usa el ID de sesión y actualiza serie/datos
 * si el usuario los corrigió en el formulario de la orden.
 */
export async function sincronizarEquipoParaOrden(
  supabase,
  {
    equipoId = null,
    serie,
    tipo_equipo,
    descripcion,
    tipo_reparacion,
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

  if (!row && serieNorm) {
    row = await buscarEquipoPorSerie(supabase, serieNorm, null, { readLs, LS_EQUIPOS })
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

  if (patch.serie) {
    const duplicado = await buscarEquipoPorSerie(supabase, patch.serie, row.id, {
      readLs,
      LS_EQUIPOS,
    })
    if (duplicado) {
      return {
        id: null,
        error: `Ya existe otro equipo con la serie "${patch.serie}". Use otra serie o edite ese equipo en Equipos.`,
      }
    }
  }

  const cambio =
    normalizarSerieEquipo(row.serie) !== patch.serie ||
    String(row.tipo_equipo ?? '').trim().toUpperCase() !== String(patch.tipo_equipo ?? '').trim().toUpperCase() ||
    String(row.descripcion ?? '').trim().toUpperCase() !== String(patch.descripcion ?? '').trim().toUpperCase() ||
    String(row.tipo_reparacion ?? '').trim().toUpperCase() !==
      String(patch.tipo_reparacion ?? '').trim().toUpperCase()

  if (cambio) {
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
