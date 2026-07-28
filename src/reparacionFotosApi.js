/** Adjuntos de órdenes de servicio (bucket `orden-fotos`: imágenes, PDF, etc.). */

export const BUCKET_ORDEN_FOTOS = 'orden-fotos'
export const LS_REP_FOTOS = 'sistebit_local_reparacion_fotos'

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

export function esMimeImagen(mime, nombre = '') {
  const m = String(mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp|svg)$/i.test(String(nombre))
}

export function validarArchivoAdjuntoOrden(file) {
  if (!file) throw new Error('No se seleccionó archivo')
  // Cualquier tipo (png, jpg, pdf, doc, etc.); solo exigir que exista el archivo.
  if (file.size != null && Number(file.size) < 0) {
    throw new Error('Archivo inválido')
  }
}

function extensionArchivo(file) {
  const n = String(file?.name ?? '')
  const m = n.match(/\.([a-z0-9]+)$/i)
  if (m) return m[1].toLowerCase()
  const t = String(file?.type ?? '').toLowerCase()
  if (t === 'image/png') return 'png'
  if (t === 'image/webp') return 'webp'
  if (t === 'image/gif') return 'gif'
  if (t === 'application/pdf') return 'pdf'
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg'
  if (t.includes('word')) return 'docx'
  if (t.includes('sheet') || t.includes('excel')) return 'xlsx'
  return 'bin'
}

function contentTypeArchivo(file, ext) {
  if (file?.type) return file.type
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function uuidPath() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function urlPublicaFotoOrden(supabase, storagePath) {
  if (!storagePath) return null
  if (String(storagePath).startsWith('data:') || String(storagePath).startsWith('blob:')) {
    return storagePath
  }
  if (!supabase?.storage) return null
  const { data } = supabase.storage.from(BUCKET_ORDEN_FOTOS).getPublicUrl(storagePath)
  return data?.publicUrl ? `${data.publicUrl}?v=${encodeURIComponent(storagePath)}` : null
}

function mapFilaFoto(row, supabase) {
  const mime = row.mime ?? ''
  const nombre = row.nombre_archivo ?? ''
  return {
    id: row.id,
    reparaId: row.repara_id,
    storagePath: row.storage_path,
    nombreArchivo: nombre,
    mime,
    bytes: row.bytes ?? null,
    createdAt: row.created_at ?? null,
    esImagen: esMimeImagen(mime, nombre),
    url: urlPublicaFotoOrden(supabase, row.storage_path) ?? row.storage_path,
  }
}

/** Lista adjuntos guardados de una orden. */
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

function mensajeErrorStorage(error) {
  const msg = String(error?.message ?? error ?? '')
  const low = msg.toLowerCase()
  if (low.includes('bucket') || low.includes('not found') || low.includes('does not exist')) {
    return 'Falta configurar el almacenamiento de adjuntos en Supabase (migración orden-fotos).'
  }
  if (low.includes('mime') || low.includes('not allowed') || low.includes('invalid')) {
    return `Tipo de archivo no permitido en el servidor: ${msg}`
  }
  if (low.includes('row-level security') || low.includes('rls') || low.includes('permission')) {
    return 'Sin permiso para subir archivos. Revise sesión o políticas RLS.'
  }
  if (low.includes('reparacion_fotos') || low.includes('relation') || low.includes('schema cache')) {
    return 'Falta la tabla reparacion_fotos en Supabase. Aplique la migración de adjuntos.'
  }
  return msg || 'Error al subir archivo'
}

/** Sube un adjunto y registra metadatos. */
export async function subirFotoReparacion(supabase, reparaId, file) {
  validarArchivoAdjuntoOrden(file)
  const rid = Number(reparaId)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('ID de orden inválido')

  if (!supabase) {
    const dataUrl = await fileToDataUrl(file)
    const row = {
      id: nextLocalId(),
      repara_id: rid,
      storage_path: dataUrl,
      nombre_archivo: file.name || 'archivo',
      mime: file.type || 'application/octet-stream',
      bytes: file.size ?? null,
      created_at: new Date().toISOString(),
    }
    writeLs(LS_REP_FOTOS, [row, ...readLs(LS_REP_FOTOS, [])])
    return mapFilaFoto(row, null)
  }

  const ext = extensionArchivo(file)
  const storagePath = `${rid}/${uuidPath()}.${ext}`
  const contentType = contentTypeArchivo(file, ext)

  const { error: upErr } = await supabase.storage.from(BUCKET_ORDEN_FOTOS).upload(storagePath, file, {
    upsert: false,
    contentType,
    cacheControl: '3600',
  })
  if (upErr) throw new Error(mensajeErrorStorage(upErr))

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
    nombre_archivo: file.name || `archivo.${ext}`,
    mime: contentType,
    bytes: file.size ?? null,
    created_by: createdBy,
  }

  const { data, error } = await supabase.from('reparacion_fotos').insert(meta).select('*').single()
  if (error) {
    await supabase.storage.from(BUCKET_ORDEN_FOTOS).remove([storagePath])
    throw new Error(mensajeErrorStorage(error))
  }
  return mapFilaFoto(data, supabase)
}

/** Sube varios adjuntos; continúa con el resto si alguno falla. */
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

/** Elimina adjunto (storage + fila). */
export async function eliminarFotoReparacion(supabase, foto) {
  if (!foto?.id) throw new Error('Archivo inválido')

  if (!supabase) {
    writeLs(
      LS_REP_FOTOS,
      readLs(LS_REP_FOTOS, []).filter((f) => Number(f.id) !== Number(foto.id)),
    )
    return
  }

  const path = foto.storagePath
  const { error } = await supabase.from('reparacion_fotos').delete().eq('id', foto.id)
  if (error) throw new Error(mensajeErrorStorage(error))

  if (path && !String(path).startsWith('data:') && !String(path).startsWith('blob:')) {
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

/** @deprecated usar validarArchivoAdjuntoOrden */
export function validarArchivoFotoOrden(file) {
  return validarArchivoAdjuntoOrden(file)
}
