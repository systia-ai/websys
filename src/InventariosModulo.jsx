/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de productos (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { sameId } from './clienteUtils.js'
import { esProductoContable } from './productoUtils.js'

const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_VISTA_INVENTARIO = 'sistefix_inventario_vista'
const LS_DATOS = 'sistefix_local_datos'

const TIPOS_PRODUCTO = [
  { id: 'CONSUMIBLE', label: 'Consumible', prefijo: 'C', contable: true },
  { id: 'REFACCION', label: 'Refacción', prefijo: 'R', contable: true },
  { id: 'SERVICIO', label: 'Servicio', prefijo: 'S', contable: false },
]

function prefijoSeriePorTipo(tipoProducto) {
  const tipo = TIPOS_PRODUCTO.find((t) => t.id === String(tipoProducto ?? '').trim().toUpperCase())
  return tipo?.prefijo ?? 'C'
}

function inferirTipoProducto(p) {
  const tipoDb = String(p?.tipo_producto ?? p?.tipo ?? '').trim().toUpperCase()
  if (TIPOS_PRODUCTO.some((t) => t.id === tipoDb)) return tipoDb
  const serieUpper = String(p?.serie ?? '').trim().toUpperCase()
  if (serieUpper.startsWith('S-')) return 'SERVICIO'
  if (serieUpper.startsWith('R-')) return 'REFACCION'
  return 'CONSUMIBLE'
}

async function obtenerSiguienteConsecutivoSerie(supabase, prefijo) {
  const pref = String(prefijo ?? '').trim().toUpperCase()
  if (!supabase) return null
  const { data, error } = await supabase.from('productos').select('serie').ilike('serie', `${pref}-%`)
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

async function escribirId2Datos(supabase, valor) {
  const n = Math.max(1, Math.floor(Number(valor) || 1))
  if (supabase) {
    const { data, error } = await supabase.from('Datos').select('id, id2').limit(1).maybeSingle()
    if (error) throw error
    if (data?.id != null) {
      const { error: upError } = await supabase.from('Datos').update({ id2: n }).eq('id', data.id)
      if (upError) throw upError
    }
    return
  }
  const rows = readLs(LS_DATOS, [])
  if (!rows.length) {
    writeLs(LS_DATOS, [{ id: 1, Serie: 1, id2: n }])
    return
  }
  const first = { ...rows[0], id2: n }
  writeLs(LS_DATOS, [first, ...rows.slice(1)])
}

function leerVistaInventario() {
  try {
    return localStorage.getItem(LS_VISTA_INVENTARIO) === 'tabla' ? 'tabla' : 'lista'
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

/** Orden A→Z solo por descripción (la serie no influye). */
function compararProductosPorDescripcion(a, b) {
  const da = String(a?.descripcion ?? '').trim()
  const db = String(b?.descripcion ?? '').trim()
  if (!da && !db) return 0
  if (!da) return 1
  if (!db) return -1
  return da.localeCompare(db, 'es', { sensitivity: 'base', numeric: true })
}

/**
 * Inventarios / catálogo de productos (tabla `productos`), flujo tipo pantalla dedicada en Android:
 * lista con búsqueda, alta, edición y baja.
 */
export default function InventariosModulo({ supabase, onHome, onError, onNotice }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState(leerVistaInventario)

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [tipoProducto, setTipoProducto] = useState('CONSUMIBLE')
  const [serie, setSerie] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [existencia, setExistencia] = useState('')
  const [precioCompra, setPrecioCompra] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [contable, setContable] = useState(true)

  const [eliminar, setEliminar] = useState(null)

  const cargarProductos = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('productos')
          .select('*')
          .order('descripcion', { ascending: true })
        if (error) throw error
        const lista = [...(data ?? [])]
        lista.sort(compararProductosPorDescripcion)
        setProductos(lista)
      } else {
        const lista = [...readLs(LS_PRODUCTOS, [])]
        lista.sort(compararProductosPorDescripcion)
        setProductos(lista)
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
    const base = !t
      ? [...productos]
      : productos.filter((p) => {
          const s = String(p.serie ?? '').toLowerCase()
          const d = String(p.descripcion ?? '').toLowerCase()
          return s.includes(t) || d.includes(t)
        })

    base.sort(compararProductosPorDescripcion)
    return base
  }, [productos, busqueda])

  function abrirNuevo() {
    setEditando(null)
    setTipoProducto('CONSUMIBLE')
    setSerie('')
    setDescripcion('')
    setCantidad('')
    setExistencia('')
    setPrecioCompra('')
    setPrecioVenta('')
    setContable(true)
    setDialogo(true)
  }

  function abrirEditar(p) {
    setEditando(p)
    setTipoProducto(inferirTipoProducto(p))
    setSerie(String(p.serie ?? '').toUpperCase())
    setDescripcion(String(p.descripcion ?? '').toUpperCase())
    setCantidad(p.cantidad != null && p.cantidad !== '' ? String(p.cantidad) : '')
    setExistencia(p.existencia != null && p.existencia !== '' ? String(p.existencia) : '')
    setPrecioCompra(p.precio_compra != null && p.precio_compra !== '' ? String(p.precio_compra) : '')
    setPrecioVenta(p.precio_venta != null && p.precio_venta !== '' ? String(p.precio_venta) : '')
    setContable(esProductoContable(p))
    setDialogo(true)
  }

  function onDescripcionChange(val) {
    setDescripcion(val)
  }

  function onSerieChange(val) {
    setSerie(val)
  }

  async function guardar() {
    const ser = serie.trim().toUpperCase()
    const desc = descripcion.trim().toUpperCase()
    const tipo = String(tipoProducto ?? '').trim().toUpperCase()
    const tipoValido = TIPOS_PRODUCTO.some((t) => t.id === tipo)
    if (!tipoValido) {
      onError?.('Seleccione tipo de producto')
      return
    }
    if (!ser) {
      onError?.('La serie es obligatoria')
      return
    }
    if (!desc) {
      onError?.('La descripción es obligatoria')
      return
    }
    const esContable = contable
    const row = {
      serie: ser,
      tipo_producto: tipo,
      descripcion: desc,
      cantidad: esContable ? (toIntOrNull(cantidad) ?? 0) : 0,
      existencia: esContable ? (toIntOrNull(existencia) ?? 0) : 0,
      precio_compra: toNum(precioCompra),
      precio_venta: toNum(precioVenta),
      contable: esContable,
    }
    const rowDb = row
    try {
      if (supabase) {
        if (editando?.id != null) {
          const { error } = await supabase.from('productos').update(rowDb).eq('id', editando.id)
          if (error) throw error
          onNotice?.('Producto actualizado')
        } else {
          const { error } = await supabase.from('productos').insert(rowDb)
          if (error) throw error
          await escribirId2Datos(supabase, Number(ser.split('-')[1] ?? 1)).catch(() => {})
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
          escribirId2Datos(null, Number(ser.split('-')[1] ?? 1)).catch(() => {})
        }
        onNotice?.(editando?.id != null ? 'Producto actualizado' : 'Producto agregado')
      }
      setDialogo(false)
      const idGuardado = editando?.id
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

  async function generarSerieProducto() {
    const tipo = String(tipoProducto ?? '').trim().toUpperCase()
    const pref = prefijoSeriePorTipo(tipo)
    try {
      let next = 1
      if (supabase) {
        next = await obtenerSiguienteConsecutivoSerie(supabase, pref)
      } else {
        const list = readLs(LS_PRODUCTOS, [])
        const nums = list
          .map((p) => String(p?.serie ?? '').trim().toUpperCase())
          .map((s) => {
            const m = s.match(new RegExp(`^${pref}-(\\d{1,})$`))
            return m ? Number(m[1]) : null
          })
          .filter((n) => Number.isFinite(n))
        const max = nums.length ? Math.max(...nums) : 0
        next = max + 1
      }
      const serieGenerada = `${pref}-${String(next).padStart(4, '0')}`
      setSerie(serieGenerada)
      await escribirId2Datos(supabase, next).catch(() => {})
      onNotice?.(`Serie sugerida: ${serieGenerada}`)
    } catch (e) {
      onError?.(`Error al generar serie: ${e.message}`)
    }
  }

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_INVENTARIO, modo)
    } catch {
      /* ignore */
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
    <div className={`servicios-root inventarios-root inventarios-modulo${vista === 'tabla' ? ' inventarios-modulo--tabla' : ''}`}>
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={handleAtras} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">📦</span>
          Inventarios
        </h1>
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

        <div className="cuentas-cliente-vista-bar inventarios-lista-vista-bar" role="group" aria-label="Forma de ver el inventario">
          <button
            type="button"
            className={`cuentas-cliente-vista-btn${vista === 'lista' ? ' cuentas-cliente-vista-btn--active' : ''}`}
            onClick={() => cambiarVista('lista')}
            aria-pressed={vista === 'lista'}
          >
            🗂️ Tarjetas
          </button>
          <button
            type="button"
            className={`cuentas-cliente-vista-btn${vista === 'tabla' ? ' cuentas-cliente-vista-btn--active' : ''}`}
            onClick={() => cambiarVista('tabla')}
            aria-pressed={vista === 'tabla'}
          >
            📊 Tabla
          </button>
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>{busqueda.trim() ? 'No se encontraron resultados' : 'No hay productos en inventario'}</p>
          </div>
        ) : vista === 'tabla' ? (
          <TablaScrollSuperior
            ariaLabel="Inventario en tabla"
            classNameWrap="cuentas-cliente-tabla-wrap inventarios-lista-tabla-wrap"
            syncDeps={[vista, filtrados, loading]}
          >
            <table className="cuentas-cliente-tabla inventarios-lista-tabla">
              <thead>
                <tr>
                  <th className="inventarios-lista-col-editar" aria-label="Editar">
                    ✏️
                  </th>
                  <th>Serie</th>
                  <th>Descripción</th>
                  <th>Stock</th>
                  <th>P. compra</th>
                  <th>P. venta</th>
                  <th className="inventarios-lista-col-eliminar" aria-label="Eliminar">
                    🗑️
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const esContable = esProductoContable(p)
                  return (
                    <tr
                      key={p.id}
                      className="inventarios-lista-tabla-fila inventarios-lista-tabla-fila--clic"
                      role="button"
                      tabIndex={0}
                      title={`Editar · ${p.serie || 'producto'}`}
                      onClick={() => abrirEditar(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrirEditar(p)
                        }
                      }}
                    >
                      <td className="cuentas-cliente-tabla-acciones inventarios-lista-tabla-acciones inventarios-lista-col-editar">
                        <button
                          type="button"
                          className="btn-icon edit inventarios-lista-btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirEditar(p)
                          }}
                          title="Editar producto"
                          aria-label="Editar producto"
                        >
                          ✏️
                        </button>
                      </td>
                      <td className="inventarios-lista-col-serie">
                        <strong>{p.serie || 'Sin serie'}</strong>
                      </td>
                      <td className="inventarios-lista-col-desc">{p.descripcion || '—'}</td>
                      <td className="inventarios-lista-col-stock">
                        {esContable ? (
                          <span>
                            Ex. {p.existencia ?? '—'} · Cant. {p.cantidad ?? '—'}
                          </span>
                        ) : (
                          <span className="inventarios-badge-servicio-tabla">Servicio</span>
                        )}
                      </td>
                      <td className="inventarios-lista-col-precio">${Number(p.precio_compra ?? 0).toFixed(2)}</td>
                      <td className="inventarios-lista-col-precio">${Number(p.precio_venta ?? 0).toFixed(2)}</td>
                      <td className="cuentas-cliente-tabla-acciones inventarios-lista-tabla-acciones inventarios-lista-col-eliminar">
                        <button
                          type="button"
                          className="btn-icon danger inventarios-lista-btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEliminar(p)
                          }}
                          title="Eliminar producto"
                          aria-label="Eliminar producto"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TablaScrollSuperior>
        ) : (
          <ul className="equipo-list inventario-list">
            {filtrados.map((p) => (
              <li key={p.id} className="equipo-card inventario-card">
                <button type="button" className="equipo-card-main inventario-card-main" onClick={() => abrirEditar(p)}>
                  <span className="inventario-card-texto">
                  <strong>{p.serie || 'Sin serie'}</strong>
                  <span className="muted">{p.descripcion || '—'}</span>
                  <span className="muted small">
                    {esProductoContable(p) ? (
                      <>
                        Existencia: {p.existencia ?? '—'} · Cantidad: {p.cantidad ?? '—'}
                      </>
                    ) : (
                      <span className="inventario-badge-servicio">Servicio · sin inventario</span>
                    )}
                  </span>
                  <span className="muted small">
                    Compra ${Number(p.precio_compra ?? 0).toFixed(2)} · Venta ${Number(p.precio_venta ?? 0).toFixed(2)}
                  </span>
                  </span>
                </button>
                <div className="equipo-card-actions">
                  <button type="button" className="btn-icon edit" onClick={() => abrirEditar(p)} title="Editar" aria-label="Editar">
                    ✏️
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setEliminar(p)} title="Eliminar" aria-label="Eliminar">
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
              <h3>{editando ? 'Editar producto' : 'Agregar producto'}</h3>
            </div>
              <div className="modal-body form-stack">
              <label>
                Tipo de producto
                <select
                  value={tipoProducto}
                  onChange={(e) => {
                    const tipo = String(e.target.value ?? '').toUpperCase()
                    setTipoProducto(tipo)
                    const cfg = TIPOS_PRODUCTO.find((t) => t.id === tipo)
                    if (cfg) setContable(cfg.contable)
                  }}
                >
                  {TIPOS_PRODUCTO.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.prefijo})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Serie
                <input value={serie} onChange={(e) => onSerieChange(e.target.value.toUpperCase())} placeholder="Serie del producto" />
              </label>
              {!editando ? (
                <button type="button" className="btn-secondary" onClick={() => void generarSerieProducto()}>
                  Generar Serie
                </button>
              ) : null}
              <label>
                Descripción
                <input
                  value={descripcion}
                  onChange={(e) => onDescripcionChange(e.target.value.toUpperCase())}
                  placeholder="Descripción"
                />
              </label>
              <label className={`inventario-contable-card${contable ? ' activo' : ''}`} title="Servicios (reseteo) sin stock: desmarque">
                <input
                  type="checkbox"
                  className="inventario-contable-input"
                  checked={contable}
                  onChange={(e) => setContable(e.target.checked)}
                />
                <span className="inventario-contable-check" aria-hidden="true">
                  ✓
                </span>
                <span className="inventario-contable-texto">
                  <span className="inventario-contable-titulo">Contable</span>
                  <span className="inventario-contable-sub">
                    {contable ? 'Descuenta existencia' : 'Solo cobro · servicio'}
                  </span>
                </span>
              </label>
              {contable ? (
                <>
                  <label>
                    Cantidad
                    <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
                  </label>
                  <label>
                    Existencia
                    <input inputMode="numeric" value={existencia} onChange={(e) => setExistencia(e.target.value)} placeholder="0" />
                  </label>
                </>
              ) : null}
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
