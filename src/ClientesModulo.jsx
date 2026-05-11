/* eslint-disable react-hooks/set-state-in-effect -- efecto de carga inicial de clientes (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import CuentasClientePanel from './CuentasClientePanel.jsx'

const LS_CLIENTES = 'sistefix_local_clientes'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_REP = 'sistefix_local_reparaciones'
const LS_EQUIPOS = 'sistefix_local_equipos'

function nextLocalClienteId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
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

function isReparacionActiva(rep) {
  return String(rep?.estatus ?? '').toUpperCase() !== 'ENTREGADO'
}

/**
 * Módulo Clientes alineado con ClientesScreen.kt (lista, búsqueda, acciones Servicio/Cuentas, reparaciones activas, ventas).
 */
export default function ClientesModulo({
  supabase,
  onHome,
  onOpenServiciosConCliente,
  onOpenReparaciones,
  onOpenVentas,
  onIrEquipos,
  onIrAOrdenServicio,
  onError,
  onNotice,
}) {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [textoBusqueda, setTextoBusqueda] = useState('')

  const [dialogoCliente, setDialogoCliente] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [domicilio, setDomicilio] = useState('')
  const [correo, setCorreo] = useState('')
  const [clienteEditando, setClienteEditando] = useState(null)

  const [modalAcciones, setModalAcciones] = useState(false)
  const [clienteAccion, setClienteAccion] = useState(null)

  const [panelCuentasAbierto, setPanelCuentasAbierto] = useState(false)
  const [clienteCuentasPanel, setClienteCuentasPanel] = useState(null)
  const [cuentasEncontradas, setCuentasEncontradas] = useState([])
  const [repsPorReparaId, setRepsPorReparaId] = useState({})
  const [loadingCuentas, setLoadingCuentas] = useState(false)
  const [cuentaTitle, setCuentaTitle] = useState('Cuentas del Cliente')
  const [cuentaSubtitle, setCuentaSubtitle] = useState('')

  const [modalRepActivas, setModalRepActivas] = useState(false)
  const [repsActivas, setRepsActivas] = useState([])
  const [loadingReps, setLoadingReps] = useState(false)
  const [repTitle, setRepTitle] = useState('Reparaciones Activas')
  const [repSubtitle, setRepSubtitle] = useState('')

  const [cargandoEquipoRep, setCargandoEquipoRep] = useState(false)

  const clientesFiltrados = useMemo(() => {
    const t = textoBusqueda.trim().toLowerCase()
    if (!t) return clientes
    return clientes.filter((c) => {
      const n = String(c.nombre ?? '').toLowerCase()
      const tel = String(c.telefono ?? '').toLowerCase()
      const dom = String(c.domicilio ?? '').toLowerCase()
      const mail = String(c.correo ?? '').toLowerCase()
      return n.includes(t) || tel.includes(t) || dom.includes(t) || mail.includes(t)
    })
  }, [clientes, textoBusqueda])

  const cargarClientes = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false })
        if (error) throw error
        setClientes((data ?? []).map((r) => normalizeClienteRow(r)))
      } else {
        setClientes(readLs(LS_CLIENTES, []).map((r) => normalizeClienteRow(r)))
      }
    } catch (e) {
      onError?.(`Error al cargar clientes: ${e.message}`)
      setClientes([])
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarClientes()
  }, [cargarClientes])

  function abrirAgregar() {
    setNombre('')
    setTelefono('')
    setDomicilio('')
    setCorreo('')
    setClienteEditando(null)
    setDialogoCliente(true)
  }

  function abrirEditar(c) {
    const row = normalizeClienteRow(c)
    setNombre(row.nombre)
    setTelefono(row.telefono)
    setDomicilio(row.domicilio)
    setCorreo(row.correo)
    setClienteEditando(row)
    setDialogoCliente(true)
  }

  async function guardarCliente() {
    if (!nombre.trim()) {
      onError?.('El nombre es requerido')
      return
    }
    if (!telefono.trim()) {
      onError?.('El teléfono es requerido')
      return
    }
    const row = {
      nombre: nombre.trim().toUpperCase(),
      telefono: telefono.trim(),
      domicilio: domicilio.trim().toUpperCase(),
      correo: correo.trim().toLowerCase(),
    }
    try {
      if (supabase) {
        if (clienteEditando?.id != null) {
          const { error } = await supabase.from('clientes').update(row).eq('id', clienteEditando.id)
          if (error) throw error
          onNotice?.('Cliente actualizado')
        } else {
          const { error } = await supabase.from('clientes').insert(row)
          if (error) throw error
          onNotice?.('Cliente agregado')
        }
      } else {
        const list = readLs(LS_CLIENTES, [])
        if (clienteEditando?.id != null) {
          writeLs(
            LS_CLIENTES,
            list.map((item) => (sameId(item.id, clienteEditando.id) ? { ...item, ...row } : item)),
          )
          onNotice?.('Cliente actualizado')
        } else {
          const nuevo = { id: nextLocalClienteId(list), ...row }
          writeLs(LS_CLIENTES, [nuevo, ...list])
          onNotice?.('Cliente agregado')
        }
      }
      setDialogoCliente(false)
      setClienteEditando(null)
      await cargarClientes()
    } catch (e) {
      onError?.(`Error al guardar cliente: ${e.message}`)
    }
  }

  async function eliminarCliente(c) {
    const row = normalizeClienteRow(c)
    if (row.id == null) {
      onError?.('No se puede eliminar: ID inválido')
      return
    }
    if (!confirm(`¿Eliminar al cliente "${row.nombre || row.id}"?`)) return
    try {
      if (supabase) {
        const { error } = await supabase.from('clientes').delete().eq('id', row.id)
        if (error) throw error
      } else {
        const list = readLs(LS_CLIENTES, [])
        writeLs(
          LS_CLIENTES,
          list.filter((item) => !sameId(item.id, row.id)),
        )
      }
      onNotice?.('Cliente eliminado')
      await cargarClientes()
    } catch (e) {
      onError?.(`Error al eliminar: ${e.message}`)
    }
  }

  function abrirAcciones(c) {
    setClienteAccion(normalizeClienteRow(c))
    setModalAcciones(true)
  }

  async function buscarCuentasCliente() {
    const cliente = clienteAccion
    if (!cliente?.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    const cli = normalizeClienteRow(cliente)
    setModalAcciones(false)
    setClienteCuentasPanel(cli)
    setPanelCuentasAbierto(true)
    setLoadingCuentas(true)
    setCuentaTitle(`Cuentas de ${cli.nombre || 'Cliente'}`)
    setCuentaSubtitle('')
    try {
      let todasCuentas = []
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').select('*').order('id', { ascending: false })
        if (error) throw error
        todasCuentas = data ?? []
      } else {
        todasCuentas = readLs(LS_CUENTAS, [])
      }
      const cuentasCliente = todasCuentas.filter((cu) => sameId(cu.cliente_id, cli.id))
      const ids = [...new Set(cuentasCliente.map((c) => c.repara_id).filter((id) => id != null && id !== ''))]
      const map = {}
      if (ids.length) {
        const pairs = await Promise.all(
          ids.map(async (rid) => {
            if (supabase) {
              const { data: rep } = await supabase.from('reparaciones').select('*').eq('id', rid).maybeSingle()
              return [rid, rep ?? null]
            }
            const allRep = readLs(LS_REP, [])
            const rep = allRep.find((r) => sameId(r.id, rid))
            return [rid, rep ?? null]
          }),
        )
        for (const [rid, rep] of pairs) {
          if (rep) {
            map[rid] = rep
            map[String(rid)] = rep
          }
        }
      }
      setCuentasEncontradas(cuentasCliente)
      setRepsPorReparaId(map)
      setCuentaSubtitle(
        cuentasCliente.length === 0
          ? 'No se encontraron cuentas para este cliente'
          : `Se encontraron ${cuentasCliente.length} cuenta(s):`,
      )
    } catch (e) {
      setCuentaTitle('Error')
      setCuentaSubtitle(`Error al buscar cuentas: ${e.message}`)
      setCuentasEncontradas([])
      setRepsPorReparaId({})
    } finally {
      setLoadingCuentas(false)
    }
  }

  async function buscarReparacionesActivas() {
    const cliente = clienteAccion
    if (!cliente?.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    setModalAcciones(false)
    setLoadingReps(true)
    setRepTitle('Reparaciones Activas')
    try {
      let todas = []
      if (supabase) {
        const { data, error } = await supabase.from('reparaciones').select('*').order('id', { ascending: false })
        if (error) throw error
        todas = data ?? []
      } else {
        todas = readLs(LS_REP, [])
      }
      const activas = todas.filter((r) => sameId(r.cliente_id, cliente.id) && isReparacionActiva(r))
      setRepsActivas(activas)
      const n = activas.length
      setRepSubtitle(
        n > 0
          ? `Se encontraron ${n} reparación${n === 1 ? '' : 'es'} activa${n === 1 ? '' : 's'} para '${cliente.nombre || ''}'`
          : `No se encontraron reparaciones activas para '${cliente.nombre || ''}'`,
      )
      setModalRepActivas(true)
    } catch (e) {
      setRepTitle('Error de búsqueda')
      setRepSubtitle(`Error: ${e.message}`)
      setRepsActivas([])
      setModalRepActivas(true)
    } finally {
      setLoadingReps(false)
    }
  }

  async function fetchEquipoPorId(equipoId) {
    if (equipoId == null) return { serie: '', tipo: '' }
    if (supabase) {
      const { data } = await supabase.from('equipos').select('*').eq('id', equipoId).maybeSingle()
      return { serie: data?.serie ?? '', tipo: data?.tipo_equipo ?? '' }
    }
    const list = readLs(LS_EQUIPOS, [])
    const eq = list.find((e) => sameId(e.id, equipoId))
    return { serie: eq?.serie ?? '', tipo: eq?.tipo_equipo ?? '' }
  }

  async function seleccionarReparacionActiva(rep) {
    const cliente = clienteAccion
    if (!cliente || !rep) return
    setCargandoEquipoRep(true)
    setModalRepActivas(false)
    try {
      const { serie: serieEquipo, tipo: tipoEquipo } = await fetchEquipoPorId(rep.equipo_id)
      onOpenReparaciones({
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        clienteDomicilio: cliente.domicilio,
        clienteCorreo: cliente.correo,
        equipoSerie: serieEquipo,
        equipoTipo: tipoEquipo,
        equipoDescripcion: '',
        equipoTipoReparacion: rep.tipo_reparacion ?? '',
        reparacionId: rep.id != null ? String(rep.id) : '',
      })
    } catch (e) {
      onError?.(`Error al cargar información del equipo: ${e.message}`)
    } finally {
      setCargandoEquipoRep(false)
    }
  }

  function nuevaReparacionIrServicios() {
    const cliente = clienteAccion
    setModalRepActivas(false)
    if (cliente?.id != null) {
      onOpenServiciosConCliente?.(cliente)
    }
  }

  function irVentasConCuenta(cuenta) {
    const cliente = clienteCuentasPanel
    if (!cliente) return
    setPanelCuentasAbierto(false)
    setClienteCuentasPanel(null)
    onOpenVentas?.({
      cliente,
      cuenta: cuenta
        ? {
            id: cuenta.id,
            total: cuenta.total,
            estatus: cuenta.estatus,
            repara_id: cuenta.repara_id,
          }
        : undefined,
    })
  }

  function cerrarPanelCuentas() {
    setPanelCuentasAbierto(false)
    setClienteCuentasPanel(null)
  }

  return (
    <div className="servicios-root clientes-modulo">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Inicio">
          ←
        </button>
        <h1 className="servicios-appbar-title">Clientes</h1>
        {onIrEquipos || onIrAOrdenServicio ? (
          <div className="appbar-actions-cluster">
            {onIrEquipos ? (
              <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onIrEquipos}>
                Equipos
              </button>
            ) : null}
            {onIrAOrdenServicio ? (
              <button
                type="button"
                className="appbar-text-btn appbar-text-btn--narrow"
                onClick={onIrAOrdenServicio}
                title="Orden de servicio"
              >
                Orden
              </button>
            ) : null}
          </div>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className="servicios-body">
        <button type="button" className="btn-agregar-equipo" onClick={abrirAgregar}>
          + AGREGAR CLIENTE
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar por nombre, teléfono, domicilio o correo..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : clientesFiltrados.length === 0 ? (
          <div className="empty-card">
            <p>{textoBusqueda.trim() ? 'No se encontraron resultados' : 'No hay clientes registrados'}</p>
          </div>
        ) : (
          <ul className="equipo-list">
            {clientesFiltrados.map((c) => {
              const row = normalizeClienteRow(c)
              return (
                <li key={row.id ?? row.nombre} className="equipo-card cliente-card-row">
                  <button type="button" className="equipo-card-main" onClick={() => abrirAcciones(row)}>
                    <strong>{row.nombre || 'Sin nombre'}</strong>
                    <span className="muted">📞 {row.telefono || 'Sin teléfono'}</span>
                    {row.domicilio ? <span className="muted small">🏠 {row.domicilio}</span> : null}
                    {row.correo ? <span className="muted small">✉️ {row.correo}</span> : null}
                  </button>
                  <div className="equipo-card-actions">
                    <button type="button" className="btn-icon edit" onClick={() => abrirEditar(row)} title="Editar">
                      ✎
                    </button>
                    <button type="button" className="btn-icon danger" onClick={() => eliminarCliente(row)} title="Eliminar">
                      🗑
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {dialogoCliente && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogoCliente(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{clienteEditando ? 'Editar Cliente' : 'Agregar Cliente'}</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Nombre
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value.toUpperCase())}
                  placeholder="Nombre del cliente"
                />
              </label>
              <label>
                Teléfono
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" />
              </label>
              <label>
                Domicilio
                <input
                  value={domicilio}
                  onChange={(e) => setDomicilio(e.target.value.toUpperCase())}
                  placeholder="Domicilio"
                />
              </label>
              <label>
                Correo
                <input
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value.toLowerCase())}
                  placeholder="Correo"
                />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setDialogoCliente(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void guardarCliente()}>
                {clienteEditando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAcciones && clienteAccion && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setModalAcciones(false); setClienteAccion(null) }}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Acciones para {clienteAccion.nombre || 'Cliente'}</h3>
            </div>
            <div className="modal-body">
              <p className="muted">Selecciona una acción:</p>
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="btn-servicio" onClick={() => void buscarReparacionesActivas()}>
                Servicio
              </button>
              <button type="button" className="btn-cuentas" onClick={() => void buscarCuentasCliente()}>
                Cuentas
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setModalAcciones(false)
                  setClienteAccion(null)
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {panelCuentasAbierto && clienteCuentasPanel ? (
        <CuentasClientePanel
          cliente={clienteCuentasPanel}
          title={cuentaTitle}
          subtitle={cuentaSubtitle}
          cuentas={cuentasEncontradas}
          repsPorReparaId={repsPorReparaId}
          loading={loadingCuentas}
          onClose={cerrarPanelCuentas}
          onSelectCuenta={(cuenta) => irVentasConCuenta(cuenta)}
          onNuevaCuenta={() => irVentasConCuenta(null)}
        />
      ) : null}

      {modalRepActivas && clienteAccion && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalRepActivas(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{repTitle}</h3>
            </div>
            <div className="modal-body">
              <p className="muted">{repSubtitle}</p>
              {loadingReps ? (
                <p className="center">Cargando…</p>
              ) : repsActivas.length > 0 ? (
                <ul className="rep-activa-list">
                  {repsActivas.map((rep) => (
                    <li key={rep.id}>
                      <button type="button" className="rep-activa-card" onClick={() => void seleccionarReparacionActiva(rep)}>
                        <strong>🔧 Reparación #{rep.id}</strong>
                        {rep.tipo_reparacion ? <span className="small">🔧 Tipo: {rep.tipo_reparacion}</span> : null}
                        {rep.descripcion_equipo ? <span className="small">📝 {rep.descripcion_equipo}</span> : null}
                        {rep.problemas_reportados ? <span className="small">⚠️ {rep.problemas_reportados}</span> : null}
                        <span className="small">📊 Estado: {rep.estatus ?? 'Sin estado'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="warning-inline">No hay reparaciones activas para mostrar</p>
              )}
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="btn-agregar-equipo modal-btn-compact" onClick={nuevaReparacionIrServicios}>
                Nueva Reparación
              </button>
              <button type="button" className="secondary" onClick={() => setModalRepActivas(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {cargandoEquipoRep && (
        <div className="modal-backdrop">
          <div className="modal modal-narrow">
            <div className="modal-header">
              <h3>Cargando información</h3>
            </div>
            <div className="modal-body center">
              <p className="muted">Espere un momento por favor…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
