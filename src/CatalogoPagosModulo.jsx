/* eslint-disable react-hooks/set-state-in-effect -- carga inicial catálogo (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sameId } from './clienteUtils.js'

const LS_CATALOGO = 'sistefix_local_catalogopagos'

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

/**
 * Catálogo de conceptos de pago (`catalogopagos`), pantalla dedicada como en Android:
 * lista, búsqueda, alta/edición y baja (concepto + cantidad/monto por defecto).
 */
export default function CatalogoPagosModulo({ supabase, onHome, onError, onNotice }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [concepto, setConcepto] = useState('')
  const [cantidad, setCantidad] = useState('')

  const [eliminar, setEliminar] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('catalogopagos').select('*').order('id', { ascending: false })
        if (error) throw error
        setItems(data ?? [])
      } else {
        setItems(readLs(LS_CATALOGO, []))
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
    if (!t) return items
    return items.filter((c) => String(c.concepto ?? '').toLowerCase().includes(t))
  }, [items, busqueda])

  function abrirNuevo() {
    setEditando(null)
    setConcepto('')
    setCantidad('')
    setDialogo(true)
  }

  function abrirEditar(row) {
    setEditando(row)
    setConcepto(String(row.concepto ?? '').toUpperCase())
    setCantidad(row.cantidad != null && row.cantidad !== '' ? String(row.cantidad) : '')
    setDialogo(true)
  }

  async function guardar() {
    const con = concepto.trim().toUpperCase()
    if (!con) {
      onError?.('El concepto es obligatorio')
      return
    }
    const cant = toNum(cantidad)
    if (cant == null || cant < 0) {
      onError?.('Indique una cantidad o monto válido (≥ 0)')
      return
    }
    const row = { concepto: con, cantidad: cant }
    try {
      if (supabase) {
        if (editando?.id != null) {
          const { error } = await supabase.from('catalogopagos').update(row).eq('id', editando.id)
          if (error) throw error
          onNotice?.('Concepto actualizado')
        } else {
          const { error } = await supabase.from('catalogopagos').insert(row)
          if (error) throw error
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
        onError?.('Ya existe un concepto con ese nombre.')
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

  return (
    <div className="servicios-root inventarios-root catalogo-pagos-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Inicio">
          ←
        </button>
        <h1 className="servicios-appbar-title">Catálogo de pagos</h1>
        <span className="servicios-appbar-placeholder" aria-hidden />
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
            placeholder="Buscar por concepto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>{busqueda.trim() ? 'No se encontraron resultados' : 'No hay conceptos en el catálogo'}</p>
          </div>
        ) : (
          <ul className="equipo-list inventario-list">
            {filtrados.map((c) => (
              <li key={c.id} className="equipo-card inventario-card">
                <button type="button" className="equipo-card-main inventario-card-main" onClick={() => abrirEditar(c)}>
                  <strong>{c.concepto || '—'}</strong>
                  <span className="muted small">Cantidad / monto por defecto: ${Number(c.cantidad ?? 0).toFixed(2)}</span>
                </button>
                <div className="equipo-card-actions">
                  <button type="button" className="btn-icon edit" onClick={() => abrirEditar(c)} title="Editar">
                    ✎
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setEliminar(c)} title="Eliminar">
                    🗑
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
