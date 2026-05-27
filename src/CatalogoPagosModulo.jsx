/* eslint-disable react-hooks/set-state-in-effect -- carga inicial catálogo (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sameId } from './clienteUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

const LS_CATALOGO = 'sistefix_local_catalogopagos'
const LS_VISTA_CATALOGO_PAGOS = 'sistefix_catalogo_pagos_vista'
const LS_DATOS = 'sistefix_local_datos'
const PREFIJO_SERIE_CATALOGO = 'S'

async function obtenerSiguienteSerieCatalogo(supabase) {
  const pref = PREFIJO_SERIE_CATALOGO
  if (!supabase) return null
  const { data, error } = await supabase.from('catalogopagos').select('serie').ilike('serie', `${pref}-%`)
  if (error) throw error
  let max = 0
  for (const row of data ?? []) {
    const s = String(row?.serie ?? '').trim().toUpperCase()
    const m = s.match(new RegExp(`^${pref}-(\\d{1,})$`))
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

async function escribirId3Datos(supabase, valor) {
  const n = Math.max(1, Math.floor(Number(valor) || 1))
  if (supabase) {
    const { data, error } = await supabase.from('Datos').select('id, id3').limit(1).maybeSingle()
    if (error) throw error
    if (data?.id != null) {
      const { error: upError } = await supabase.from('Datos').update({ id3: n }).eq('id', data.id)
      if (upError) throw upError
    }
    return
  }
  const rows = readLs(LS_DATOS, [])
  if (!rows.length) {
    writeLs(LS_DATOS, [{ id: 1, Serie: 1, id2: 1, id3: n }])
    return
  }
  const first = { ...rows[0], id3: n }
  writeLs(LS_DATOS, [first, ...rows.slice(1)])
}

function leerVistaCatalogoPagos() {
  try {
    return localStorage.getItem(LS_VISTA_CATALOGO_PAGOS) === 'tabla' ? 'tabla' : 'lista'
  } catch {
    return 'lista'
  }
}

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function writeLs(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

function nextLocalId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
}

function toNum(v) {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Orden A→Z por nombre del concepto. */
function compararCatalogoPorConcepto(a, b) {
  const ca = String(a?.concepto ?? '').trim()
  const cb = String(b?.concepto ?? '').trim()
  if (!ca && !cb) return 0
  if (!ca) return 1
  if (!cb) return -1
  return ca.localeCompare(cb, 'es', { sensitivity: 'base', numeric: true })
}

/**
 * Catálogo de conceptos de pago (`catalogopagos`), pantalla dedicada como en Android:
 * lista, búsqueda, alta/edición y baja (concepto + cantidad/monto por defecto).
 */
export default function CatalogoPagosModulo({ supabase, onHome, onError, onNotice }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState(leerVistaCatalogoPagos)

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [serie, setSerie] = useState('')
  const [concepto, setConcepto] = useState('')
  const [cantidad, setCantidad] = useState('')

  const [eliminar, setEliminar] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('catalogopagos')
          .select('*')
          .order('concepto', { ascending: true })
        if (error) throw error
        const lista = [...(data ?? [])]
        lista.sort(compararCatalogoPorConcepto)
        setItems(lista)
      } else {
        const lista = [...readLs(LS_CATALOGO, [])]
        lista.sort(compararCatalogoPorConcepto)
        setItems(lista)
      }
    } catch (e) {
      onError?.(`Error al cargar catálogo: ${e.message}`)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    const base = !t
      ? [...items]
      : items.filter((c) => {
          const con = String(c.concepto ?? '').toLowerCase()
          const ser = String(c.serie ?? '').toLowerCase()
          return con.includes(t) || ser.includes(t)
        })
    base.sort(compararCatalogoPorConcepto)
    return base
  }, [items, busqueda])

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_CATALOGO_PAGOS, modo)
    } catch {
      /* ignore */
    }
  }

  function abrirNuevo() {
    setEditando(null)
    setSerie('')
    setConcepto('')
    setCantidad('')
    setDialogo(true)
  }

  function abrirEditar(row) {
    setEditando(row)
    setSerie(String(row.serie ?? '').toUpperCase())
    setConcepto(String(row.concepto ?? '').toUpperCase())
    setCantidad(row.cantidad != null && row.cantidad !== '' ? String(row.cantidad) : '')
    setDialogo(true)
  }

  async function generarSerieCatalogo() {
    try {
      let next = 1
      if (supabase) {
        next = await obtenerSiguienteSerieCatalogo(supabase)
      } else {
        const list = readLs(LS_CATALOGO, [])
        const nums = list
          .map((c) => String(c?.serie ?? '').trim().toUpperCase())
          .map((s) => {
            const m = s.match(new RegExp(`^${PREFIJO_SERIE_CATALOGO}-(\\d{1,})$`))
            return m ? Number(m[1]) : null
          })
          .filter((n) => Number.isFinite(n))
        const max = nums.length ? Math.max(...nums) : 0
        next = max + 1
      }
      const serieGenerada = `${PREFIJO_SERIE_CATALOGO}-${String(next).padStart(4, '0')}`
      setSerie(serieGenerada)
      await escribirId3Datos(supabase, next).catch(() => {})
      onNotice?.(`Serie sugerida: ${serieGenerada}`)
    } catch (e) {
      onError?.(`Error al generar serie: ${e.message}`)
    }
  }

  async function guardar() {
    const ser = serie.trim().toUpperCase()
    const con = concepto.trim().toUpperCase()
    if (!ser) {
      onError?.('La serie es obligatoria')
      return
    }
    if (!con) {
      onError?.('El concepto es obligatorio')
      return
    }
    const cant = toNum(cantidad)
    if (cant == null) {
      onError?.('Indique una cantidad o monto válido')
      return
    }
    const row = { serie: ser, concepto: con, cantidad: cant }
    try {
      if (supabase) {
        if (editando?.id != null) {
          const { error } = await supabase.from('catalogopagos').update(row).eq('id', editando.id)
          if (error) throw error
          onNotice?.('Concepto actualizado')
        } else {
          const { error } = await supabase.from('catalogopagos').insert(row)
          if (error) throw error
          await escribirId3Datos(supabase, Number(ser.split('-')[1] ?? 1)).catch(() => {})
          onNotice?.('Concepto agregado')
        }
      } else {
        const list = readLs(LS_CATALOGO, [])
        if (editando?.id != null) {
          writeLs(
            LS_CATALOGO,
            list.map((x) => (sameId(x.id, editando.id) ? { ...x, ...row } : x)),
          )
        } else {
          writeLs(LS_CATALOGO, [{ id: nextLocalId(list), ...row }, ...list])
        }
        onNotice?.(editando?.id != null ? 'Concepto actualizado' : 'Concepto agregado')
      }
      setDialogo(false)
      setEditando(null)
      await cargar()
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('duplicate') || msg.includes('23505')) {
        onError?.('Ya existe un concepto con esa serie o nombre.')
      } else {
        onError?.(`Error al guardar: ${msg}`)
      }
    }
  }

  async function confirmarEliminar() {
    const row = eliminar
    if (!row?.id) return
    try {
      if (supabase) {
        const { error } = await supabase.from('catalogopagos').delete().eq('id', row.id)
        if (error) throw error
      } else {
        const list = readLs(LS_CATALOGO, [])
        writeLs(
          LS_CATALOGO,
          list.filter((x) => !sameId(x.id, row.id)),
        )
      }
      setEliminar(null)
      await cargar()
      onNotice?.('Concepto eliminado')
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('foreign key') || msg.includes('23503')) {
        onError?.('No se puede eliminar: el concepto está en pagos registrados.')
      } else {
        onError?.(`Error al eliminar: ${msg}`)
      }
    }
  }

  function handleAtras() {
    if (eliminar) {
      setEliminar(null)
      return
    }
    if (dialogo) {
      setDialogo(false)
      return
    }
    onHome?.()
  }

  return (
    <div className="servicios-root inventarios-root catalogo-pagos-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={handleAtras} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">💳</span>
          Catálogo de pagos
        </h1>
        {onHome ? (
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
            Inicio
          </button>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className="servicios-body">
        <button type="button" className="btn-agregar-equipo btn-agregar-catalogo-pagos" onClick={abrirNuevo}>
          + AGREGAR CONCEPTO
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar por serie o concepto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="inventario-vista-bar card-pad" role="group" aria-label="Modo de visualización">
          <span className="inventario-vista-label">Ver como:</span>
          <div className="inventario-vista-toggle">
            <button
              type="button"
              className={`inventario-vista-btn${vista === 'lista' ? ' activo' : ''}`}
              onClick={() => cambiarVista('lista')}
              aria-pressed={vista === 'lista'}
            >
              📋 Lista
            </button>
            <button
              type="button"
              className={`inventario-vista-btn${vista === 'tabla' ? ' activo' : ''}`}
              onClick={() => cambiarVista('tabla')}
              aria-pressed={vista === 'tabla'}
            >
              ▦ Tabla
            </button>
          </div>
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>{busqueda.trim() ? 'No se encontraron resultados' : 'No hay conceptos en el catálogo'}</p>
          </div>
        ) : vista === 'tabla' ? (
          <TablaScrollSuperior
            ariaLabel="Catálogo de pagos en tabla"
            classNameWrap="catalogo-pagos-tabla-wrap"
            syncDeps={[vista, filtrados, loading]}
          >
              <div className="inventario-tabla-grid catalogo-pagos-tabla-grid">
                <div className="inventario-tabla-fila-grupo inventario-tabla-cabecera" role="row">
                  <div className="inventario-tabla-grupo-celdas inventario-tabla-grupo-celdas--cabecera">
                    <span className="inventario-tabla-th inventario-celda inventario-celda--serie-cat">Serie</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--concepto">Concepto</span>
                    <span className="inventario-tabla-th inventario-celda inventario-celda--monto-cat">Monto por defecto</span>
                  </div>
                  <span className="inventario-tabla-th inventario-tabla-th--acc">Acciones</span>
                </div>
                {filtrados.map((c) => (
                  <div
                    key={c.id}
                    className="inventario-tabla-fila-grupo inventario-tabla-fila-grupo--clic"
                    role="button"
                    tabIndex={0}
                    title={`Editar · ${c.concepto || c.serie || 'concepto'}`}
                    onClick={() => abrirEditar(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        abrirEditar(c)
                      }
                    }}
                  >
                    <div className="inventario-tabla-grupo-celdas">
                      <span className="inventario-celda inventario-celda--serie-cat">{c.serie || '—'}</span>
                      <span className="inventario-celda inventario-celda--concepto">{c.concepto || '—'}</span>
                      <span className="inventario-celda inventario-celda--monto-cat">
                        ${Number(c.cantidad ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="inventario-tabla-acciones">
                      <button
                        type="button"
                        className="btn-icon edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirEditar(c)
                        }}
                        title="Editar"
                        aria-label="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEliminar(c)
                        }}
                        title="Eliminar"
                        aria-label="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
          </TablaScrollSuperior>
        ) : (
          <ul className="equipo-list inventario-list">
            {filtrados.map((c) => (
              <li key={c.id} className="equipo-card inventario-card">
                <button type="button" className="equipo-card-main inventario-card-main" onClick={() => abrirEditar(c)}>
                  <strong>{c.serie || '—'}</strong>
                  <span className="muted">{c.concepto || '—'}</span>
                  <span className="muted small">Monto por defecto: ${Number(c.cantidad ?? 0).toFixed(2)}</span>
                </button>
                <div className="equipo-card-actions">
                  <button type="button" className="btn-icon edit" onClick={() => abrirEditar(c)} title="Editar" aria-label="Editar">
                    ✏️
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setEliminar(c)} title="Eliminar" aria-label="Eliminar">
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialogo && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogo(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editando ? 'Editar concepto' : 'Agregar concepto'}</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Serie
                <input
                  value={serie}
                  onChange={(e) => setSerie(e.target.value.toUpperCase())}
                  placeholder="Ej. S-0001"
                />
              </label>
              {!editando ? (
                <button type="button" className="btn-secondary" onClick={() => void generarSerieCatalogo()}>
                  Generar Serie
                </button>
              ) : null}
              <label>
                Concepto
                <input
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value.toUpperCase())}
                  placeholder="Ej. ANTICIPO, SERVICIO EPSON…"
                />
              </label>
              <label>
                Cantidad (monto por defecto)
                <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0.00" />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setDialogo(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void guardar()}>
                {editando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {eliminar && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEliminar(null)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Eliminar concepto</h3>
            </div>
            <div className="modal-body">
              <p>
                ¿Eliminar <strong>{eliminar.concepto}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setEliminar(null)}>
                Cancelar
              </button>
              <button type="button" className="danger" onClick={() => void confirmarEliminar()}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
