/** Fotos del equipo ligadas a órdenes de servicio (bucket `orden-fotos`). */

export const BUCKET_ORDEN_FOTOS = 'orden-fotos'
export const LS_REP_FOTOS = 'sistefix_local_reparacion_fotos'

const TIPOS_IMAGEN = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
])

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

function nextLocalId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function esImagenAceptada(file) {
  if (!file) return false
  if (file.type && TIPOS_IMAGEN.has(file.type)) return true
  // Algunos móviles no reportan MIME; aceptar por extensión.
  const n = String(file.name ?? '').toLowerCase()
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(n)
}

export function validarArchivoFotoOrden(file) {
  if (!file) throw new Error('No se seleccionó archivo')
  if (!esImagenAceptada(file)) {
    throw new Error('Solo se permiten imágenes (JPG, PNG, WEBP, HEIC, GIF)')
  }
}

function extensionArchivo(file) {
  const n = String(file?.name ?? '')
  const m = n.match(/\.([a-z0-9]+)$/i)
  if (m) return m[1].toLowerCase()
  if (file?.type === 'image/png') return 'png'
  if (file?.type === 'image/webp') return 'webp'
  if (file?.type === 'image/gif') return 'gif'
  if (file?.type === 'image/heic' || file?.type === 'image/heif') return 'heic'
  return 'jpg'
}

function uuidPath() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function urlPublicaFotoOrden(supabase, storagePath) {
  if (!storagePath) return null
  if (String(storagePath).startsWith('data:')) return storagePath
  if (!supabase?.storage) return null
  const { data } = supabase.storage.from(BUCKET_ORDEN_FOTOS).getPublicUrl(storagePath)
  return data?.publicUrl ? `${data.publicUrl}?v=${encodeURIComponent(storagePath)}` : null
}

function mapFilaFoto(row, supabase) {
  return {
    id: row.id,
    reparaId: row.repara_id,
    storagePath: row.storage_path,
    nombreArchivo: row.nombre_archivo ?? '',
    mime: row.mime ?? '',
    bytes: row.bytes ?? null,
    createdAt: row.created_at ?? null,
    url: urlPublicaFotoOrden(supabase, row.storage_path) ?? row.storage_path,
  }
}

/** Lista fotos guardadas de una orden. */
export async function listarFotosReparacion(supabase, reparaId) {
  const rid = Number(reparaId)
  if (!Number.isFinite(rid) || rid <= 0) return []

  if (!supabase) {
    return readLs(LS_REP_FOTOS, [])
      .filter((f) => Number(f.repara_id) === rid)
      .map((row) => mapFilaFoto(row, null))
      .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
  }

  const { data, error } = await supabase
    .from('reparacion_fotos')
    .select('id, repara_id, storage_path, nombre_archivo, mime, bytes, created_at')
    .eq('repara_id', rid)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapFilaFoto(row, supabase))
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

/** Sube una foto y registra metadatos. */
export async function subirFotoReparacion(supabase, reparaId, file) {
  validarArchivoFotoOrden(file)
  const rid = Number(reparaId)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('ID de orden inválido')

  if (!supabase) {
    const dataUrl = await fileToDataUrl(file)
    const row = {
      id: nextLocalId(),
      repara_id: rid,
      storage_path: dataUrl,
      nombre_archivo: file.name || 'foto.jpg',
      mime: file.type || 'image/jpeg',
      bytes: file.size ?? null,
      created_at: new Date().toISOString(),
    }
    writeLs(LS_REP_FOTOS, [row, ...readLs(LS_REP_FOTOS, [])])
    return mapFilaFoto(row, null)
  }

  const ext = extensionArchivo(file)
  const storagePath = `${rid}/${uuidPath()}.${ext}`
  const contentType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`

  const { error: upErr } = await supabase.storage.from(BUCKET_ORDEN_FOTOS).upload(storagePath, file, {
    upsert: false,
    contentType,
    cacheControl: '3600',
  })
  if (upErr) throw upErr

  let createdBy = null
  try {
    const { data: authData } = await supabase.auth.getUser()
    createdBy = authData?.user?.id ?? null
  } catch {
    /* ignore */
  }

  const meta = {
    repara_id: rid,
    storage_path: storagePath,
    nombre_archivo: file.name || `foto.${ext}`,
    mime: contentType,
    bytes: file.size ?? null,
    created_by: createdBy,
  }

  const { data, error } = await supabase.from('reparacion_fotos').insert(meta).select('*').single()
  if (error) {
    await supabase.storage.from(BUCKET_ORDEN_FOTOS).remove([storagePath])
    throw error
  }
  return mapFilaFoto(data, supabase)
}

/** Sube varias fotos; continúa con el resto si alguna falla. */
export async function subirFotosReparacionLote(supabase, reparaId, files) {
  const resultados = []
  const errores = []
  for (const file of files ?? []) {
    try {
      resultados.push(await subirFotoReparacion(supabase, reparaId, file))
    } catch (e) {
      errores.push({ nombre: file?.name ?? 'archivo', error: e?.message ?? String(e) })
    }
  }
  return { fotos: resultados, errores }
}

/** Elimina foto (storage + fila). */
export async function eliminarFotoReparacion(supabase, foto) {
  if (!foto?.id) throw new Error('Foto inválida')

  if (!supabase) {
    writeLs(
      LS_REP_FOTOS,
      readLs(LS_REP_FOTOS, []).filter((f) => Number(f.id) !== Number(foto.id)),
    )
    return
  }

  const path = foto.storagePath
  const { error } = await supabase.from('reparacion_fotos').delete().eq('id', foto.id)
  if (error) throw error

  if (path && !String(path).startsWith('data:')) {
    await supabase.storage.from(BUCKET_ORDEN_FOTOS).remove([path])
  }
}

/** Quita objetos de storage de una orden (antes de borrar la orden). */
export async function limpiarStorageFotosReparacion(supabase, reparaId) {
  if (!supabase) {
    const rid = Number(reparaId)
    writeLs(
      LS_REP_FOTOS,
      readLs(LS_REP_FOTOS, []).filter((f) => Number(f.repara_id) !== rid),
    )
    return
  }
  const rid = Number(reparaId)
  if (!Number.isFinite(rid) || rid <= 0) return

  const { data } = await supabase.from('reparacion_fotos').select('storage_path').eq('repara_id', rid)
  const paths = (data ?? []).map((r) => r.storage_path).filter(Boolean)
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET_ORDEN_FOTOS).remove(paths)
  }
}
