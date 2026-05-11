/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de productos (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sameId } from './clienteUtils.js'

const LS_PRODUCTOS = 'sistefix_local_productos'

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

function nextLocalProductId(list) {
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

function toIntOrNull(v) {
  const n = parseInt(String(v).trim(), 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Inventarios / catálogo de productos (tabla `productos`), flujo tipo pantalla dedicada en Android:
 * lista con búsqueda, alta, edición y baja.
 */
export default function InventariosModulo({ supabase, onHome, onError, onNotice }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [serie, setSerie] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [existencia, setExistencia] = useState('')
  const [precioCompra, setPrecioCompra] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')

  const [eliminar, setEliminar] = useState(null)

  const cargarProductos = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('productos').select('*').order('id', { ascending: false })
        if (error) throw error
        setProductos(data ?? [])
      } else {
        setProductos(readLs(LS_PRODUCTOS, []))
      }
    } catch (e) {
      onError?.(`Error al cargar inventario: ${e.message}`)
      setProductos([])
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarProductos()
  }, [cargarProductos])

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return productos
    return productos.filter((p) => {
      const s = String(p.serie ?? '').toLowerCase()
      const d = String(p.descripcion ?? '').toLowerCase()
      return s.includes(t) || d.includes(t)
    })
  }, [productos, busqueda])

  function abrirNuevo() {
    setEditando(null)
    setSerie('')
    setDescripcion('')
    setCantidad('')
    setExistencia('')
    setPrecioCompra('')
    setPrecioVenta('')
    setDialogo(true)
  }

  function abrirEditar(p) {
    setEditando(p)
    setSerie(String(p.serie ?? '').toUpperCase())
    setDescripcion(String(p.descripcion ?? '').toUpperCase())
    setCantidad(p.cantidad != null && p.cantidad !== '' ? String(p.cantidad) : '')
    setExistencia(p.existencia != null && p.existencia !== '' ? String(p.existencia) : '')
    setPrecioCompra(p.precio_compra != null && p.precio_compra !== '' ? String(p.precio_compra) : '')
    setPrecioVenta(p.precio_venta != null && p.precio_venta !== '' ? String(p.precio_venta) : '')
    setDialogo(true)
  }

  async function guardar() {
    const ser = serie.trim().toUpperCase()
    const desc = descripcion.trim().toUpperCase()
    if (!ser) {
      onError?.('La serie es obligatoria')
      return
    }
    if (!desc) {
      onError?.('La descripción es obligatoria')
      return
    }
    const row = {
      serie: ser,
      descripcion: desc,
      cantidad: toIntOrNull(cantidad) ?? 0,
      existencia: toIntOrNull(existencia) ?? 0,
      precio_compra: toNum(precioCompra),
      precio_venta: toNum(precioVenta),
    }
    try {
      if (supabase) {
        if (editando?.id != null) {
          const { error } = await supabase.from('productos').update(row).eq('id', editando.id)
          if (error) throw error
          onNotice?.('Producto actualizado')
        } else {
          const { error } = await supabase.from('productos').insert(row)
          if (error) throw error
          onNotice?.('Producto agregado')
        }
      } else {
        const list = readLs(LS_PRODUCTOS, [])
        if (editando?.id != null) {
          writeLs(
            LS_PRODUCTOS,
            list.map((x) => (sameId(x.id, editando.id) ? { ...x, ...row } : x)),
          )
        } else {
          writeLs(LS_PRODUCTOS, [{ id: nextLocalProductId(list), ...row }, ...list])
        }
        onNotice?.(editando?.id != null ? 'Producto actualizado' : 'Producto agregado')
      }
      setDialogo(false)
      setEditando(null)
      await cargarProductos()
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('duplicate') || msg.includes('23505')) {
        onError?.('Ya existe un producto con esa serie.')
      } else {
        onError?.(`Error al guardar: ${msg}`)
      }
    }
  }

  async function confirmarEliminar() {
    const p = eliminar
    if (!p?.id) return
    try {
      if (supabase) {
        const { error } = await supabase.from('productos').delete().eq('id', p.id)
        if (error) throw error
      } else {
        const list = readLs(LS_PRODUCTOS, [])
        writeLs(
          LS_PRODUCTOS,
          list.filter((x) => !sameId(x.id, p.id)),
        )
      }
      setEliminar(null)
      await cargarProductos()
      onNotice?.('Producto eliminado')
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('foreign key') || msg.includes('23503')) {
        onError?.('No se puede eliminar: el producto está en movimientos o cuentas.')
      } else {
        onError?.(`Error al eliminar: ${msg}`)
      }
    }
  }

  return (
    <div className="servicios-root inventarios-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Inicio">
          ←
        </button>
        <h1 className="servicios-appbar-title">Inventarios</h1>
        <span className="servicios-appbar-placeholder" aria-hidden />
      </header>

      <div className="servicios-body">
        <button type="button" className="btn-agregar-equipo btn-agregar-inventario" onClick={abrirNuevo}>
          + AGREGAR PRODUCTO
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar por serie o descripción…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>{busqueda.trim() ? 'No se encontraron resultados' : 'No hay productos en inventario'}</p>
          </div>
        ) : (
          <ul className="equipo-list inventario-list">
            {filtrados.map((p) => (
              <li key={p.id} className="equipo-card inventario-card">
                <button type="button" className="equipo-card-main inventario-card-main" onClick={() => abrirEditar(p)}>
                  <strong>{p.serie || 'Sin serie'}</strong>
                  <span className="muted">{p.descripcion || '—'}</span>
                  <span className="muted small">
                    Existencia: {p.existencia ?? '—'} · Cantidad: {p.cantidad ?? '—'}
                  </span>
                  <span className="muted small">
                    Compra ${Number(p.precio_compra ?? 0).toFixed(2)} · Venta ${Number(p.precio_venta ?? 0).toFixed(2)}
                  </span>
                </button>
                <div className="equipo-card-actions">
                  <button type="button" className="btn-icon edit" onClick={() => abrirEditar(p)} title="Editar">
                    ✎
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setEliminar(p)} title="Eliminar">
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
              <h3>{editando ? 'Editar producto' : 'Agregar producto'}</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Serie
                <input value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="Serie del producto" />
              </label>
              <label>
                Descripción
                <input
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value.toUpperCase())}
                  placeholder="Descripción"
                />
              </label>
              <label>
                Cantidad
                <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
              </label>
              <label>
                Existencia
                <input inputMode="numeric" value={existencia} onChange={(e) => setExistencia(e.target.value)} placeholder="0" />
              </label>
              <label>
                Precio compra
                <input inputMode="decimal" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} placeholder="0.00" />
              </label>
              <label>
                Precio venta
                <input inputMode="decimal" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} placeholder="0.00" />
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
              <h3>Eliminar producto</h3>
            </div>
            <div className="modal-body">
              <p>
                ¿Eliminar <strong>{eliminar.serie}</strong>?
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
