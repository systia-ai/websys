/* eslint-disable react-hooks/set-state-in-effect -- efectos de carga inicial (equipos / Supabase) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TIPOS_EQUIPO_SERVICIOS, TIPOS_REPARACION } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'

const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_REP = 'sistefix_local_reparaciones'
const LS_DATOS = 'sistefix_local_datos'

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

let __localIdSeq = 1
function nextLocalId() {
  __localIdSeq += 1
  return __localIdSeq
}

async function obtenerSerieContador(supabase) {
  if (supabase) {
    const { data, error } = await supabase.from('Datos').select('*').limit(1).maybeSingle()
    if (error) throw error
    if (!data) return null
    const n = data.Serie ?? data.serie
    if (n == null) return null
    return Math.floor(Number(n))
  }
  let rows = readLs(LS_DATOS, [])
  if (!rows.length) {
    rows = [{ id: 1, Serie: 1 }]
    writeLs(LS_DATOS, rows)
  }
  const first = rows[0]
  const n = first?.Serie ?? first?.serie
  return n != null ? Math.floor(Number(n)) : null
}

async function incrementarSerieContador(supabase) {
  if (supabase) {
    const { data, error } = await supabase.from('Datos').select('*').limit(1).maybeSingle()
    if (error) throw error
    if (!data?.id) return false
    const actual = Number(data.Serie ?? data.serie ?? 0)
    const payload = data.Serie != null ? { Serie: actual + 1 } : { serie: actual + 1 }
    const { error: up } = await supabase.from('Datos').update(payload).eq('id', data.id)
    if (up) throw up
    return true
  }
  const rows = readLs(LS_DATOS, [{ id: 1, Serie: 1 }])
  const first = { ...rows[0] }
  first.Serie = Math.floor(Number(first.Serie ?? first.serie ?? 0)) + 1
  writeLs(LS_DATOS, [first])
  return true
}

export default function ServiciosEquipos({
  supabase,
  onHome,
  onIrAClientes,
  onIrAOrdenServicio,
  onOpenReparaciones,
  onError,
  onNotice,
  clienteDesdeClientes = null,
  onConsumeClienteVinculo,
}) {
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [dialogoEquipo, setDialogoEquipo] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [serie, setSerie] = useState('')
  const [tipoEquipo, setTipoEquipo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipoReparacionEq, setTipoReparacionEq] = useState('')

  const [eliminarEquipo, setEliminarEquipo] = useState(null)

  const [modalRep, setModalRep] = useState(null)
  const [repsEquipo, setRepsEquipo] = useState([])
  const [repsLoading, setRepsLoading] = useState(false)

  const [dialogoCliente, setDialogoCliente] = useState(false)
  const [clienteMotivo, setClienteMotivo] = useState('guardar')
  const [clientes, setClientes] = useState([])
  const [busqCliente, setBusqCliente] = useState('')
  const [clientesLoading, setClientesLoading] = useState(false)
  const [dialogoNuevoCliente, setDialogoNuevoCliente] = useState(false)
  const [ncNombre, setNcNombre] = useState('')
  const [ncTel, setNcTel] = useState('')
  const [ncDom, setNcDom] = useState('')
  const [ncCorreo, setNcCorreo] = useState('')

  const [equipoPendiente, setEquipoPendiente] = useState(null)

  const clienteDesdeModuloClientes = useMemo(
    () => normalizeClienteRow(clienteDesdeClientes ?? {}),
    [clienteDesdeClientes],
  )

  const cargarEquipos = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('equipos').select('*').order('id', { ascending: false })
        if (error) throw error
        setEquipos(data ?? [])
      } else {
        setEquipos(readLs(LS_EQUIPOS, []))
      }
    } catch (e) {
      onError(`Error al cargar equipos: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    cargarEquipos()
  }, [cargarEquipos])

  const filtrados = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return equipos
    return equipos.filter((eq) =>
      [eq.serie, eq.tipo_equipo, eq.descripcion, eq.tipo_reparacion]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(t)),
    )
  }, [equipos, search])

  async function cargarClientesLista() {
    setClientesLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false })
        if (error) throw error
        const list = (data ?? []).map(normalizeClienteRow)
        setClientes(list)
        return list
      }
      const list = readLs(LS_CLIENTES, []).map(normalizeClienteRow)
      setClientes(list)
      return list
    } catch (e) {
      onError(`Error al cargar clientes: ${e.message}`)
      return []
    } finally {
      setClientesLoading(false)
    }
  }

  const clientesFiltrados = useMemo(() => {
    const t = busqCliente.trim().toUpperCase()
    if (!t) return clientes
    return clientes.filter(
      (c) =>
        (c.nombre && String(c.nombre).toUpperCase().includes(t)) ||
        (c.telefono && String(c.telefono).includes(t)) ||
        (c.domicilio && String(c.domicilio).toUpperCase().includes(t)) ||
        (c.correo && String(c.correo).toUpperCase().includes(t)),
    )
  }, [clientes, busqCliente])

  function abrirAgregar() {
    setEditandoId(null)
    setSerie('')
    setTipoEquipo('')
    setDescripcion('')
    setTipoReparacionEq('')
    setEquipoPendiente(null)
    setDialogoEquipo(true)
  }

  function abrirEditar(eq) {
    setEditandoId(eq.id)
    setSerie(eq.serie ?? '')
    setTipoEquipo(eq.tipo_equipo ?? '')
    setDescripcion(eq.descripcion ?? '')
    setTipoReparacionEq(eq.tipo_reparacion ?? '')
    setEquipoPendiente(null)
    setDialogoEquipo(true)
  }

  async function generarSerie() {
    try {
      const n = await obtenerSerieContador(supabase)
      if (n == null) {
        onError('No se pudo obtener el contador de serie (tabla Datos).')
        return
      }
      setSerie(`SIS${String(n).padStart(6, '0')}`)
      onNotice(`Serie sugerida: SIS${String(n).padStart(6, '0')} (se incrementa al guardar el equipo)`)
    } catch (e) {
      onError(`Error al generar serie: ${e.message}`)
    }
  }

  async function persistEquipo(payload) {
    if (supabase) {
      if (editandoId) {
        const { error } = await supabase.from('equipos').update(payload).eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('equipos').insert(payload)
        if (error) throw error
        await incrementarSerieContador(supabase).catch(() => {})
      }
    } else {
      const list = readLs(LS_EQUIPOS, [])
      if (editandoId) {
        const next = list.map((e) => (e.id === editandoId ? { ...e, ...payload } : e))
        writeLs(LS_EQUIPOS, next)
      } else {
        const id = nextLocalId()
        writeLs(LS_EQUIPOS, [{ id, ...payload }, ...list])
        incrementarSerieContador(null).catch(() => {})
      }
    }
  }

  async function vincularEquipoClienteYReparaciones(eq, cliente) {
    const c = normalizeClienteRow(cliente)
    if (!eq?.id) {
      onError('Equipo inválido')
      return false
    }
    try {
      if (supabase) {
        const { error } = await supabase.from('equipos').update({ cliente_id: c.id }).eq('id', eq.id)
        if (error) throw error
      } else {
        const list = readLs(LS_EQUIPOS, [])
        writeLs(
          LS_EQUIPOS,
          list.map((e) => (sameId(e.id, eq.id) ? { ...e, cliente_id: c.id } : e)),
        )
      }
      await cargarEquipos()
      onNotice('Cliente asociado al equipo')
      onOpenReparaciones({
        clienteNombre: c.nombre,
        clienteTelefono: c.telefono,
        clienteDomicilio: c.domicilio,
        clienteCorreo: c.correo,
        equipoSerie: eq.serie ?? '',
        equipoTipo: eq.tipo_equipo ?? '',
        equipoDescripcion: eq.descripcion ?? '',
        equipoTipoReparacion: eq.tipo_reparacion ?? '',
        reparacionId: '',
      })
      return true
    } catch (e) {
      onError(`Error al asociar cliente: ${e.message}`)
      return false
    }
  }

  async function guardarEquipoDespuesCliente(cliente) {
    const cli = normalizeClienteRow(cliente)
    const base = {
      serie: String(serie).trim().toUpperCase(),
      tipo_equipo: String(tipoEquipo).trim().toUpperCase(),
      descripcion: descripcion.trim() ? String(descripcion).trim().toUpperCase() : null,
      tipo_reparacion: tipoReparacionEq.trim() ? String(tipoReparacionEq).trim().toUpperCase() : null,
      cliente_id: cli.id,
    }
    try {
      await persistEquipo(base)
      setDialogoEquipo(false)
      setDialogoCliente(false)
      await cargarEquipos()
      onNotice(editandoId ? 'Equipo actualizado' : 'Equipo agregado')
      if (!editandoId) {
        onOpenReparaciones({
          clienteNombre: cli.nombre,
          clienteTelefono: cli.telefono,
          clienteDomicilio: cli.domicilio,
          clienteCorreo: cli.correo,
          equipoSerie: base.serie,
          equipoTipo: base.tipo_equipo,
          equipoDescripcion: base.descripcion ?? '',
          equipoTipoReparacion: base.tipo_reparacion ?? '',
          reparacionId: '',
        })
        onConsumeClienteVinculo?.()
      }
    } catch (e) {
      onError(`Error al guardar equipo: ${e.message}`)
    }
  }

  function guardarEquipo() {
    if (!String(serie).trim()) {
      onError('La serie es requerida')
      return
    }
    if (!String(tipoEquipo).trim()) {
      onError('El tipo de equipo es requerido')
      return
    }
    if (editandoId) {
      persistEquipo({
        serie: String(serie).trim().toUpperCase(),
        tipo_equipo: String(tipoEquipo).trim().toUpperCase(),
        descripcion: descripcion.trim() ? String(descripcion).trim().toUpperCase() : null,
        tipo_reparacion: tipoReparacionEq.trim() ? String(tipoReparacionEq).trim().toUpperCase() : null,
      })
        .then(async () => {
          setDialogoEquipo(false)
          await cargarEquipos()
          onNotice('Equipo actualizado')
        })
        .catch((e) => onError(`Error al guardar: ${e.message}`))
      return
    }
    if (clienteDesdeModuloClientes?.id != null) {
      const cli = clienteDesdeModuloClientes
      const base = {
        serie: String(serie).trim().toUpperCase(),
        tipo_equipo: String(tipoEquipo).trim().toUpperCase(),
        descripcion: descripcion.trim() ? String(descripcion).trim().toUpperCase() : null,
        tipo_reparacion: tipoReparacionEq.trim() ? String(tipoReparacionEq).trim().toUpperCase() : null,
        cliente_id: cli.id,
      }
      void (async () => {
        try {
          await persistEquipo(base)
          setDialogoEquipo(false)
          await cargarEquipos()
          onNotice('Equipo agregado')
          onOpenReparaciones({
            clienteNombre: cli.nombre,
            clienteTelefono: cli.telefono,
            clienteDomicilio: cli.domicilio,
            clienteCorreo: cli.correo,
            equipoSerie: base.serie,
            equipoTipo: base.tipo_equipo,
            equipoDescripcion: base.descripcion ?? '',
            equipoTipoReparacion: base.tipo_reparacion ?? '',
            reparacionId: '',
          })
          onConsumeClienteVinculo?.()
        } catch (e) {
          onError(`Error al guardar equipo: ${e.message}`)
        }
      })()
      return
    }
    setEquipoPendiente({
      serie: String(serie).trim().toUpperCase(),
      tipo_equipo: String(tipoEquipo).trim().toUpperCase(),
      descripcion: descripcion.trim() ? String(descripcion).trim().toUpperCase() : null,
      tipo_reparacion: tipoReparacionEq.trim() ? String(tipoReparacionEq).trim().toUpperCase() : null,
    })
    setClienteMotivo('guardar')
    setBusqCliente('')
    setDialogoCliente(true)
    cargarClientesLista()
  }

  async function eliminarConfirmado() {
    const eq = eliminarEquipo
    if (!eq?.id) return
    try {
      if (supabase) {
        const { error } = await supabase.from('equipos').delete().eq('id', eq.id)
        if (error) throw error
      } else {
        const list = readLs(LS_EQUIPOS, [])
        writeLs(
          LS_EQUIPOS,
          list.filter((e) => e.id !== eq.id),
        )
      }
      setEliminarEquipo(null)
      await cargarEquipos()
      onNotice('Equipo eliminado')
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('foreign key') || msg.includes('23503')) {
        onError('No se puede eliminar el equipo porque está en reparaciones existentes.')
      } else {
        onError(`Error al eliminar: ${msg}`)
      }
    }
  }

  async function cargarReparacionesDeEquipo(equipoId) {
    setRepsLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('reparaciones')
          .select('*')
          .eq('equipo_id', equipoId)
          .order('id', { ascending: false })
        if (error) throw error
        setRepsEquipo(data ?? [])
      } else {
        const all = readLs(LS_REP, [])
        setRepsEquipo(all.filter((r) => Number(r.equipo_id) === Number(equipoId)).sort((a, b) => Number(b.id) - Number(a.id)))
      }
    } catch (e) {
      onError(`Error al buscar reparaciones: ${e.message}`)
      setRepsEquipo([])
    } finally {
      setRepsLoading(false)
    }
  }

  function clickFilaEquipo(eq) {
    setModalRep(eq)
    if (eq.id != null) cargarReparacionesDeEquipo(eq.id)
  }

  async function irReparacionExistente(eq, rep) {
    const listaCli = clientes.length > 0 ? clientes : await cargarClientesLista()
    let cli = listaCli.find((c) => sameId(c.id, rep.cliente_id))
    if (!cli && rep.cliente_id != null) cli = await fetchCliente(rep.cliente_id)
    const c = normalizeClienteRow(cli ?? {})
    setModalRep(null)
    onOpenReparaciones({
      clienteNombre: c.nombre,
      clienteTelefono: c.telefono,
      clienteDomicilio: c.domicilio,
      clienteCorreo: c.correo,
      equipoSerie: eq.serie ?? '',
      equipoTipo: eq.tipo_equipo ?? '',
      equipoDescripcion: eq.descripcion ?? '',
      equipoTipoReparacion: rep.tipo_reparacion ?? eq.tipo_reparacion ?? '',
      reparacionId: rep.id != null ? String(rep.id) : '',
    })
  }

  async function nuevaReparacionDesdeModal(eq) {
    if ((!eq.cliente_id || eq.cliente_id === '') && clienteDesdeModuloClientes?.id != null) {
      setModalRep(null)
      const ok = await vincularEquipoClienteYReparaciones(eq, clienteDesdeModuloClientes)
      if (ok) onConsumeClienteVinculo?.()
      return
    }
    const listaCli = clientes.length > 0 ? clientes : await cargarClientesLista()
    if (eq.cliente_id != null && eq.cliente_id !== '') {
      let cli = listaCli.find((c) => sameId(c.id, eq.cliente_id))
      if (!cli && eq.cliente_id) cli = await fetchCliente(eq.cliente_id)
      const c = normalizeClienteRow(cli ?? {})
      setModalRep(null)
      onOpenReparaciones({
        clienteNombre: c.nombre,
        clienteTelefono: c.telefono,
        clienteDomicilio: c.domicilio,
        clienteCorreo: c.correo,
        equipoSerie: eq.serie ?? '',
        equipoTipo: eq.tipo_equipo ?? '',
        equipoDescripcion: eq.descripcion ?? '',
        equipoTipoReparacion: eq.tipo_reparacion ?? '',
        reparacionId: '',
      })
      return
    }
    setModalRep(null)
    setClienteMotivo('asociar')
    setEquipoPendiente(eq)
    setBusqCliente('')
    setDialogoCliente(true)
    cargarClientesLista()
  }

  async function fetchCliente(id) {
    if (supabase) {
      const { data } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
      return data ? normalizeClienteRow(data) : null
    }
    const raw = readLs(LS_CLIENTES, []).find((c) => sameId(c.id, id))
    return raw ? normalizeClienteRow(raw) : null
  }

  async function asociarClienteYAbrirReparaciones(cliente) {
    const eq = equipoPendiente
    if (!eq?.id) {
      if (equipoPendiente && !equipoPendiente.id && clienteMotivo === 'guardar') {
        await guardarEquipoDespuesCliente(cliente)
        return
      }
      onError('Equipo inválido')
      return
    }
    const ok = await vincularEquipoClienteYReparaciones(eq, cliente)
    if (ok) {
      setDialogoCliente(false)
      setEquipoPendiente(null)
    }
  }

  function seleccionarClienteEnDialogo(cliente) {
    if (clienteMotivo === 'guardar' && equipoPendiente && !equipoPendiente.id) {
      guardarEquipoDespuesCliente(cliente)
      return
    }
    if (clienteMotivo === 'asociar') {
      asociarClienteYAbrirReparaciones(cliente)
    }
  }

  async function agregarClienteNuevo() {
    if (!ncNombre.trim()) {
      onError('El nombre del cliente es requerido')
      return
    }
    if (!ncTel.trim()) {
      onError('El teléfono del cliente es requerido')
      return
    }
    const row = {
      nombre: ncNombre.trim().toUpperCase(),
      telefono: ncTel.trim(),
      domicilio: ncDom.trim().toUpperCase(),
      correo: ncCorreo.trim().toLowerCase(),
    }
    try {
      let clienteInsertado
      if (supabase) {
        const { data, error } = await supabase.from('clientes').insert(row).select('*').single()
        if (error) throw error
        clienteInsertado = normalizeClienteRow(data)
      } else {
        const list = readLs(LS_CLIENTES, [])
        clienteInsertado = { id: nextLocalId(), ...row }
        writeLs(LS_CLIENTES, [clienteInsertado, ...list])
      }
      setDialogoNuevoCliente(false)
      setNcNombre('')
      setNcTel('')
      setNcDom('')
      setNcCorreo('')
      await cargarClientesLista()
      seleccionarClienteEnDialogo(clienteInsertado)
    } catch (e) {
      onError(`Error al agregar cliente: ${e.message}`)
    }
  }

  return (
    <div className="servicios-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">🖨️</span>
          Equipos
        </h1>
        {onIrAOrdenServicio || onIrAClientes ? (
          <div className="appbar-actions-cluster">
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
            {onIrAClientes ? (
              <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onIrAClientes}>
                Clientes
              </button>
            ) : null}
          </div>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className="servicios-body">
        {clienteDesdeModuloClientes?.id != null && (
          <div className="clientes-vinculo-banner">
            <p>
              Cliente enlazado desde <strong>Clientes</strong>:{' '}
              <strong>{clienteDesdeModuloClientes.nombre || '—'}</strong>
              {clienteDesdeModuloClientes.telefono ? ` · ${clienteDesdeModuloClientes.telefono}` : null}
            </p>
            <button type="button" className="btn-quitar-enlace" onClick={() => onConsumeClienteVinculo?.()}>
              Quitar enlace
            </button>
          </div>
        )}
        <button type="button" className="btn-agregar-equipo" onClick={abrirAgregar}>
          + AGREGAR EQUIPO
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar por serie, tipo, descripción o tipo de reparación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>{search.trim() ? 'No se encontraron resultados' : 'No hay equipos registrados'}</p>
          </div>
        ) : (
          <ul className="equipo-list">
            {filtrados.map((eq) => (
              <li key={eq.id} className="equipo-card">
                <button type="button" className="equipo-card-main" onClick={() => clickFilaEquipo(eq)}>
                  <strong>{eq.serie || 'Sin serie'}</strong>
                  <span className="muted">Tipo: {eq.tipo_equipo || '—'}</span>
                  {eq.descripcion ? <span className="muted small">{eq.descripcion}</span> : null}
                  {eq.tipo_reparacion ? <span className="muted small">Reparación: {eq.tipo_reparacion}</span> : null}
                </button>
                <div className="equipo-card-actions">
                  <button type="button" className="btn-icon edit" onClick={() => abrirEditar(eq)} title="Editar" aria-label="Editar">
                    ✏️
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setEliminarEquipo(eq)} title="Eliminar" aria-label="Eliminar">
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialogoEquipo && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogoEquipo(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editandoId ? 'Editar Equipo' : 'Agregar Equipo'}</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Serie
                <input value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="Serie del equipo" />
              </label>
              {!editandoId && (
                <button type="button" className="btn-secondary" onClick={generarSerie}>
                  Generar Serie
                </button>
              )}
              <label>
                Tipo de Equipo
                <select value={tipoEquipo} onChange={(e) => setTipoEquipo(e.target.value)}>
                  <option value="">Seleccionar tipo de equipo</option>
                  {TIPOS_EQUIPO_SERVICIOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descripción
                <input
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value.toUpperCase())}
                  placeholder="Descripción del equipo"
                />
              </label>
              <label>
                Tipo de Reparación
                <select value={tipoReparacionEq} onChange={(e) => setTipoReparacionEq(e.target.value)}>
                  <option value="">Seleccionar tipo de reparación</option>
                  {TIPOS_REPARACION.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setDialogoEquipo(false)}>
                Cancelar
              </button>
              <button type="button" onClick={guardarEquipo}>
                {editandoId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogoCliente && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setDialogoCliente(false); setEquipoPendiente(null) }}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Buscar Cliente</h3>
              <p className="muted small">
                {clienteMotivo === 'guardar'
                  ? 'El equipo requiere un cliente asociado. Busca o agrega uno:'
                  : 'Busca un cliente o agrega uno nuevo para asociarlo al equipo:'}
              </p>
            </div>
            <div className="modal-body">
              <div className="servicios-search card-pad">
                <input
                  placeholder="Buscar por nombre, teléfono, domicilio o correo..."
                  value={busqCliente}
                  onChange={(e) => setBusqCliente(e.target.value)}
                />
              </div>
              <button type="button" className="btn-agregar-equipo" style={{ marginBottom: 12 }} onClick={() => setDialogoNuevoCliente(true)}>
                + AGREGAR CLIENTE NUEVO
              </button>
              {clientesLoading ? (
                <p>Cargando clientes…</p>
              ) : clientesFiltrados.length === 0 ? (
                <div className="empty-card">
                  <p>{busqCliente.trim() ? 'No se encontraron resultados' : 'No hay clientes registrados'}</p>
                </div>
              ) : (
                <ul className="cliente-pick-list">
                  {clientesFiltrados.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="rep-card" onClick={() => seleccionarClienteEnDialogo(c)}>
                        <strong>{c.nombre}</strong>
                        {c.telefono ? <span>Tel: {c.telefono}</span> : null}
                        {c.domicilio ? <span>Dir: {c.domicilio}</span> : null}
                        {c.correo ? <span>Email: {c.correo}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDialogoCliente(false)
                  setEquipoPendiente(null)
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogoNuevoCliente && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogoNuevoCliente(false)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agregar Cliente Nuevo</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Nombre *
                <input value={ncNombre} onChange={(e) => setNcNombre(e.target.value.toUpperCase())} />
              </label>
              <label>
                Teléfono *
                <input value={ncTel} onChange={(e) => setNcTel(e.target.value)} />
              </label>
              <label>
                Domicilio
                <input value={ncDom} onChange={(e) => setNcDom(e.target.value.toUpperCase())} />
              </label>
              <label>
                Correo
                <input value={ncCorreo} onChange={(e) => setNcCorreo(e.target.value.toLowerCase())} />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setDialogoNuevoCliente(false)}>
                Cancelar
              </button>
              <button type="button" onClick={agregarClienteNuevo}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRep && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalRep(null)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reparaciones del Equipo</h3>
              <p className="muted small">
                {repsLoading
                  ? 'Buscando…'
                  : repsEquipo.length > 0
                    ? `Se encontraron ${repsEquipo.length} reparación(es) para “${modalRep.serie}”`
                    : `No se encontraron reparaciones para “${modalRep.serie}”`}
              </p>
            </div>
            <div className="modal-body">
              {repsLoading ? <p>Cargando…</p> : null}
              {!repsLoading &&
                repsEquipo.map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    className="rep-card"
                    onClick={() => {
                      void irReparacionExistente(modalRep, rep)
                    }}
                  >
                    <strong>Reparación #{rep.id}</strong>
                    {rep.tipo_reparacion ? <span>Tipo: {rep.tipo_reparacion}</span> : null}
                    {rep.descripcion_equipo ? <span>{rep.descripcion_equipo}</span> : null}
                    {rep.problemas_reportados ? <span>{rep.problemas_reportados}</span> : null}
                    <span className={`estatus estatus-${String(rep.estatus ?? '').replace(/\s+/g, '_')}`}>
                      Estado: {rep.estatus ?? 'Sin estado'}
                    </span>
                  </button>
                ))}
              {!repsLoading && repsEquipo.length === 0 ? (
                <p className="warn-inline">No hay reparaciones registradas para este equipo</p>
              ) : null}
            </div>
            <div className="modal-footer">
              {repsEquipo.length === 0 && !repsLoading ? (
                <button type="button" className="btn-success" onClick={() => nuevaReparacionDesdeModal(modalRep)}>
                  Nueva Reparación
                </button>
              ) : (
                <>
                  <button type="button" className="btn-success" onClick={() => nuevaReparacionDesdeModal(modalRep)}>
                    Nueva Reparación
                  </button>
                  <button type="button" className="secondary" onClick={() => setModalRep(null)}>
                    Cerrar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {eliminarEquipo && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEliminarEquipo(null)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-danger">Confirmar Eliminación</h3>
            </div>
            <div className="modal-body">
              <p>¿Eliminar este equipo?</p>
              <p className="muted">Serie: {eliminarEquipo.serie}</p>
              <p className="small-warn">No se puede eliminar un equipo usado en reparaciones existentes.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setEliminarEquipo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-danger" onClick={eliminarConfirmado}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
