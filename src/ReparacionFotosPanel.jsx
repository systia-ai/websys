import { useEffect, useId, useRef, useState } from 'react'
import {
  eliminarFotoReparacion,
  listarFotosReparacion,
  subirFotosReparacionLote,
} from './reparacionFotosApi.js'

/**
 * Panel de fotos del equipo en la orden de servicio.
 * - Orden nueva: acumula archivos pendientes (se suben al registrar).
 * - Orden existente: carga/sube/elimina en Supabase de inmediato.
 * - Con fotos: miniaturas + Abrir galería / Cargar más fotos.
 */
export default function ReparacionFotosPanel({
  supabase,
  reparaId = null,
  pendientes = [],
  onPendientesChange,
  onNotice,
  onError,
  disabled = false,
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [fotos, setFotos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [galeriaAbierta, setGaleriaAbierta] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(null)
  const [eliminandoKey, setEliminandoKey] = useState(null)

  const ordenExiste = reparaId != null && Number.isFinite(Number(reparaId)) && Number(reparaId) > 0

  useEffect(() => {
    if (!ordenExiste) {
      setFotos([])
      return
    }
    let cancel = false
    setCargando(true)
    void listarFotosReparacion(supabase, reparaId)
      .then((lista) => {
        if (!cancel) setFotos(lista)
      })
      .catch((e) => {
        if (!cancel) {
          setFotos([])
          console.warn('No se pudieron cargar las fotos de la orden:', e?.message ?? e)
        }
      })
      .finally(() => {
        if (!cancel) setCargando(false)
      })
    return () => {
      cancel = true
    }
  }, [ordenExiste, reparaId, supabase])

  const items = [
    ...fotos.map((foto) => ({
      key: `g-${foto.id}`,
      tipo: 'guardada',
      foto,
      url: foto.url,
      nombre: foto.nombreArchivo || 'Foto del equipo',
    })),
    ...(pendientes ?? []).map((p) => ({
      key: `p-${p.localId}`,
      tipo: 'pendiente',
      pendiente: p,
      url: p.previewUrl,
      nombre: p.nombre || 'Foto pendiente',
    })),
  ]

  const total = items.length
  const hayFotos = total > 0
  const previewItem = previewIdx != null ? items[previewIdx] : null

  async function onElegirArchivos(e) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (list.length === 0 || disabled) return

    if (!ordenExiste) {
      const nuevas = list.map((file) => ({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        nombre: file.name || 'foto',
      }))
      onPendientesChange?.([...(pendientes ?? []), ...nuevas])
      onNotice?.(
        list.length === 1 ? 'Foto lista para guardar con la orden' : `${list.length} fotos listas para guardar`,
      )
      return
    }

    setSubiendo(true)
    try {
      const { fotos: nuevas, errores } = await subirFotosReparacionLote(supabase, reparaId, list)
      if (nuevas.length > 0) {
        setFotos((prev) => [...prev, ...nuevas])
        onNotice?.(nuevas.length === 1 ? 'Foto agregada a la orden' : `${nuevas.length} fotos agregadas`)
      }
      if (errores.length > 0) {
        onError?.(
          errores.length === 1
            ? `No se pudo subir ${errores[0].nombre}: ${errores[0].error}`
            : `No se pudieron subir ${errores.length} archivo(s)`,
        )
      }
    } catch (err) {
      onError?.(err?.message ?? 'Error al subir fotos')
    } finally {
      setSubiendo(false)
    }
  }

  function quitarPendiente(localId) {
    const actual = pendientes ?? []
    const item = actual.find((p) => p.localId === localId)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    onPendientesChange?.(actual.filter((p) => p.localId !== localId))
  }

  async function quitarItem(item) {
    if (!item || disabled) return
    setEliminandoKey(item.key)
    try {
      if (item.tipo === 'pendiente') {
        quitarPendiente(item.pendiente.localId)
        onNotice?.('Foto quitada')
      } else {
        await eliminarFotoReparacion(supabase, item.foto)
        setFotos((prev) => prev.filter((f) => f.id !== item.foto.id))
        onNotice?.('Foto eliminada')
      }
      setPreviewIdx((idx) => {
        if (idx == null) return null
        const nextTotal = total - 1
        if (nextTotal <= 0) {
          setGaleriaAbierta(false)
          return null
        }
        return Math.min(idx, nextTotal - 1)
      })
    } catch (e) {
      onError?.(e?.message ?? 'No se pudo eliminar la foto')
    } finally {
      setEliminandoKey(null)
    }
  }

  function abrirFoto(idx) {
    setPreviewIdx(idx)
  }

  function cerrarPreview() {
    setPreviewIdx(null)
  }

  function irPreview(delta) {
    if (previewIdx == null || total === 0) return
    setPreviewIdx((previewIdx + delta + total) % total)
  }

  function abrirSelector() {
    inputRef.current?.click()
  }

  const miniaturasResumen = items.slice(0, 6)

  return (
    <div className="rep-block rep-block--fotos">
      <label htmlFor={inputId}>Fotos del equipo</label>
      <div className="rep-fotos-panel">
        {!ordenExiste && !hayFotos ? (
          <p className="rep-fotos-hint">Puede agregar fotos ahora; se guardarán al registrar la orden.</p>
        ) : null}

        {cargando ? <p className="rep-fotos-hint">Cargando fotos…</p> : null}

        {!cargando && !hayFotos ? <p className="rep-fotos-vacia">Sin fotos del equipo.</p> : null}

        {!cargando && hayFotos ? (
          <div className="rep-fotos-resumen">
            <p className="rep-fotos-conteo">
              {total === 1 ? '1 foto cargada' : `${total} fotos cargadas`}
              {(pendientes ?? []).length > 0
                ? ` · ${(pendientes ?? []).length} pendiente${(pendientes ?? []).length === 1 ? '' : 's'}`
                : ''}
            </p>
            <ul className="rep-fotos-grid rep-fotos-grid--resumen">
              {miniaturasResumen.map((item, idx) => (
                <li key={item.key} className="rep-fotos-item">
                  <button
                    type="button"
                    className="rep-fotos-thumb"
                    onClick={() => abrirFoto(idx)}
                    title={item.nombre}
                  >
                    <img src={item.url} alt={item.nombre} loading="lazy" />
                  </button>
                  {item.tipo === 'pendiente' ? <span className="rep-fotos-badge">Pendiente</span> : null}
                </li>
              ))}
              {total > miniaturasResumen.length ? (
                <li className="rep-fotos-item rep-fotos-item--mas">
                  <button
                    type="button"
                    className="rep-fotos-thumb rep-fotos-mas"
                    onClick={() => setGaleriaAbierta(true)}
                    title="Ver todas"
                  >
                    +{total - miniaturasResumen.length}
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <div className="rep-fotos-acciones">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="rep-fotos-input"
            disabled={disabled || subiendo}
            onChange={(e) => void onElegirArchivos(e)}
          />
          {hayFotos ? (
            <>
              <button
                type="button"
                className="btn-secondary rep-fotos-agregar"
                disabled={disabled}
                onClick={() => setGaleriaAbierta(true)}
              >
                🖼️ Abrir galería
              </button>
              <button
                type="button"
                className="btn-secondary rep-fotos-agregar"
                disabled={disabled || subiendo}
                onClick={abrirSelector}
              >
                {subiendo ? 'Subiendo…' : '📷 Cargar más fotos'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-secondary rep-fotos-agregar"
              disabled={disabled || subiendo}
              onClick={abrirSelector}
            >
              {subiendo ? 'Subiendo…' : '📷 Agregar fotos'}
            </button>
          )}
        </div>
      </div>

      {galeriaAbierta ? (
        <div
          className="rep-fotos-galeria"
          role="dialog"
          aria-modal="true"
          aria-label="Galería de fotos del equipo"
          onClick={() => setGaleriaAbierta(false)}
        >
          <div className="rep-fotos-galeria-panel" onClick={(e) => e.stopPropagation()}>
            <div className="rep-fotos-galeria-cabecera">
              <h3>Galería · {total === 1 ? '1 foto' : `${total} fotos`}</h3>
              <button
                type="button"
                className="rep-fotos-lightbox-cerrar"
                onClick={() => setGaleriaAbierta(false)}
                aria-label="Cerrar galería"
              >
                ×
              </button>
            </div>
            <ul className="rep-fotos-grid rep-fotos-grid--galeria">
              {items.map((item, idx) => (
                <li key={item.key} className="rep-fotos-item">
                  <button
                    type="button"
                    className="rep-fotos-thumb"
                    onClick={() => abrirFoto(idx)}
                    title={item.nombre}
                  >
                    <img src={item.url} alt={item.nombre} loading="lazy" />
                  </button>
                  {item.tipo === 'pendiente' ? <span className="rep-fotos-badge">Pendiente</span> : null}
                  <button
                    type="button"
                    className="rep-fotos-quitar"
                    disabled={disabled || eliminandoKey === item.key}
                    onClick={() => void quitarItem(item)}
                    title="Eliminar foto"
                    aria-label="Eliminar foto"
                  >
                    {eliminandoKey === item.key ? '…' : '×'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="rep-fotos-galeria-pie">
              <button
                type="button"
                className="btn-secondary"
                disabled={disabled || subiendo}
                onClick={abrirSelector}
              >
                {subiendo ? 'Subiendo…' : '📷 Cargar más fotos'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setGaleriaAbierta(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewItem ? (
        <div
          className="rep-fotos-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Vista de foto"
          onClick={cerrarPreview}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cerrarPreview()
            if (e.key === 'ArrowLeft') irPreview(-1)
            if (e.key === 'ArrowRight') irPreview(1)
          }}
        >
          <button
            type="button"
            className="rep-fotos-lightbox-cerrar"
            onClick={cerrarPreview}
            aria-label="Cerrar"
          >
            ×
          </button>
          {total > 1 ? (
            <>
              <button
                type="button"
                className="rep-fotos-nav rep-fotos-nav--prev"
                onClick={(e) => {
                  e.stopPropagation()
                  irPreview(-1)
                }}
                aria-label="Foto anterior"
              >
                ‹
              </button>
              <button
                type="button"
                className="rep-fotos-nav rep-fotos-nav--next"
                onClick={(e) => {
                  e.stopPropagation()
                  irPreview(1)
                }}
                aria-label="Foto siguiente"
              >
                ›
              </button>
            </>
          ) : null}
          <div className="rep-fotos-lightbox-cuerpo" onClick={(e) => e.stopPropagation()}>
            <img src={previewItem.url} alt={previewItem.nombre} className="rep-fotos-lightbox-img" />
            <div className="rep-fotos-lightbox-barra">
              <span>
                {previewIdx + 1} / {total}
                {previewItem.tipo === 'pendiente' ? ' · Pendiente' : ''}
              </span>
              <button
                type="button"
                className="btn-secondary rep-fotos-eliminar-grande"
                disabled={disabled || eliminandoKey === previewItem.key}
                onClick={() => void quitarItem(previewItem)}
              >
                {eliminandoKey === previewItem.key ? 'Eliminando…' : '🗑 Eliminar foto'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Revoca object URLs de pendientes al desmontar o limpiar. */
export function revocarPendientesFotos(pendientes) {
  for (const p of pendientes ?? []) {
    if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl)
  }
}
