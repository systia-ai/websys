import { useMemo, useState } from 'react'
import { ESTATUS_ORDEN } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'

const LS_REP = 'sistefix_local_reparaciones'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'

function readLs(key, fb) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fb))
  } catch {
    return fb
  }
}

function todayDdMmYyyy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function ddMmYyyyToYmd(s) {
  const p = String(s ?? '')
    .trim()
    .split('/')
  if (p.length !== 3) return null
  const day = parseInt(p[0], 10)
  const month = parseInt(p[1], 10)
  const year = parseInt(p[2], 10)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fechaReparacionYmd(rep) {
  const f = rep?.fecha_creacion ?? rep?.fechaCreacion ?? ''
  if (!f || typeof f !== 'string') return null
  const head = f.substring(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head
  const t = f.indexOf('T')
  if (t === 10) return f.substring(0, 10)
  return null
}

function withDetalles(rep, clientes, equipos) {
  const cli = clientes.find((c) => sameId(c.id, rep.cliente_id))
  const eq = equipos.find((e) => sameId(e.id, rep.equipo_id))
  const nombreCliente = cli?.nombre ?? 'Cliente no encontrado'
  const serieEquipo = eq?.serie ?? 'Serie no encontrada'
  const tipoEquipo = eq?.tipo_equipo ?? 'Tipo no encontrado'
  return { rep, nombreCliente, serieEquipo, tipoEquipo }
}

function mapConClienteRow(rep, clientes, equipos) {
  const cli = clientes.find((c) => sameId(c.id, rep.cliente_id)) ?? {}
  const w = withDetalles(rep, clientes, equipos)
  return { ...w, clienteRow: cli }
}

function buildSessionFromDetalleFixed(row) {
  const { rep, nombreCliente, serieEquipo, tipoEquipo, clienteRow } = row
  const c = normalizeClienteRow(clienteRow ?? { nombre: nombreCliente })
  return {
    reparacionId: rep?.id != null ? String(rep.id) : '',
    equipoSerie: serieEquipo || '',
    equipoTipo: tipoEquipo || '',
    equipoDescripcion: rep?.descripcion_equipo ?? '',
    equipoTipoReparacion: rep?.tipo_reparacion ?? '',
    clienteId: c.id ?? rep?.cliente_id,
    clienteNombre: c.nombre || nombreCliente || '',
    clienteTelefono: c.telefono,
    clienteDomicilio: c.domicilio,
    clienteCorreo: c.correo,
  }
}

async function cargarTablas(supabase) {
  if (supabase) {
    const [a, b, c] = await Promise.all([
      supabase.from('reparaciones').select('*').order('id', { ascending: false }),
      supabase.from('clientes').select('*'),
      supabase.from('equipos').select('*'),
    ])
    if (a.error) throw a.error
    if (b.error) throw b.error
    if (c.error) throw c.error
    return { reps: a.data ?? [], clientes: b.data ?? [], equipos: c.data ?? [] }
  }
  return {
    reps: readLs(LS_REP, []),
    clientes: readLs(LS_CLIENTES, []),
    equipos: readLs(LS_EQUIPOS, []),
  }
}

/**
 * Primera pantalla de Orden de servicio (como OrdenesScreen.kt antes de `ordenSeleccionada`):
 * No de orden, estatus, buscar; sin número → diálogo de rango de fechas (Android); lista y al elegir → sesión para ReparacionesOrden.
 */
export default function OrdenBusquedaInicial({ supabase, onSeleccionarOrden, onError }) {
  const [numeroOrden, setNumeroOrden] = useState('')
  const [estatus, setEstatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalFechas, setModalFechas] = useState(false)
  const [fechaIni, setFechaIni] = useState(todayDdMmYyyy)
  const [fechaFin, setFechaFin] = useState(todayDdMmYyyy)
  const [modalResultados, setModalResultados] = useState(false)
  const [tituloResultados, setTituloResultados] = useState('')
  const [subtituloResultados, setSubtituloResultados] = useState('')
  const [resultados, setResultados] = useState([])

  const estatusLista = useMemo(() => ESTATUS_ORDEN, [])

  function abrirBuscar() {
    const raw = numeroOrden.replace(/\r/g, '').replace(/\n/g, ' ')
    const no = raw.trim()
    if (!no) {
      setFechaIni(todayDdMmYyyy())
      setFechaFin(todayDdMmYyyy())
      setModalFechas(true)
      return
    }
    void ejecutarBusquedaPorNumero(no)
  }

  async function ejecutarBusquedaPorNumero(no) {
    const st = estatus.trim()
    setLoading(true)
    try {
      const { reps, clientes, equipos } = await cargarTablas(supabase)
      const asInt = parseInt(no, 10)
      const esSoloEntero = Number.isFinite(asInt) && String(asInt) === no

      let lista = []
      if (esSoloEntero) {
        const rep = reps.find((r) => sameId(r.id, asInt))
        if (!rep) {
          onError?.(
            st
              ? `No se encontró orden con ID: ${no} y estatus: ${st}`
              : `No se encontró orden con ID: ${no}`,
          )
          return
        }
        if (st && String(rep.estatus ?? '').toUpperCase() !== st.toUpperCase()) {
          onError?.(`No se encontró orden con ID: ${no} y estatus: ${st}`)
          return
        }
        lista = [mapConClienteRow(rep, clientes, equipos)]
        setTituloResultados('Orden Encontrada (1)')
        setSubtituloResultados('Orden encontrada por ID exacto:')
      } else {
        const term = no.toUpperCase()
        lista = reps
          .filter(
            (r) =>
              String(r.descripcion_equipo ?? '')
                .toUpperCase()
                .includes(term) ||
              String(r.problemas_reportados ?? '')
                .toUpperCase()
                .includes(term),
          )
          .map((r) => mapConClienteRow(r, clientes, equipos))
        if (st) {
          lista = lista.filter((row) => String(row.rep.estatus ?? '').toUpperCase() === st.toUpperCase())
        }
        setTituloResultados(`Órdenes Encontradas (${lista.length})`)
        setSubtituloResultados(
          lista.length
            ? 'Selecciona una orden para cargar sus datos:'
            : st
              ? `No se encontraron órdenes con texto '${no}' y estatus '${st}'`
              : `No se encontraron órdenes con texto: ${no}`,
        )
      }

      if (!lista.length) {
        onError?.(
          st
            ? `No se encontraron órdenes con número '${no}' y estatus '${st}'`
            : `No se encontraron órdenes con el número: ${no}`,
        )
        return
      }
      setResultados(lista)
      setModalResultados(true)
    } catch (e) {
      onError?.(`Error al buscar órdenes: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function ejecutarBusquedaPorFechas() {
    const st = estatus.trim()
    const ymdIni = ddMmYyyyToYmd(fechaIni)
    const ymdFin = ddMmYyyyToYmd(fechaFin)
    if (!ymdIni || !ymdFin) {
      onError?.('Use fechas en formato dd/MM/yyyy')
      return
    }
    if (ymdIni > ymdFin) {
      onError?.('La fecha inicial no puede ser mayor que la final')
      return
    }
    setModalFechas(false)
    setLoading(true)
    try {
      const { reps, clientes, equipos } = await cargarTablas(supabase)
      const lista = reps
        .filter((r) => {
          const ymd = fechaReparacionYmd(r)
          if (!ymd) return false
          if (ymd < ymdIni || ymd > ymdFin) return false
          if (st) return String(r.estatus ?? '').toUpperCase() === st.toUpperCase()
          return true
        })
        .map((r) => mapConClienteRow(r, clientes, equipos))

      setTituloResultados(
        st
          ? `Órdenes ${st} (${fechaIni} - ${fechaFin}) (${lista.length})`
          : `Órdenes en rango (${fechaIni} - ${fechaFin}) (${lista.length})`,
      )
      setSubtituloResultados(
        lista.length ? 'Selecciona una orden para cargar sus datos:' : 'No se encontraron órdenes en el rango y estatus seleccionados.',
      )
      if (!lista.length) {
        onError?.('No se encontraron órdenes en el rango de fechas y estatus seleccionados')
        return
      }
      setResultados(lista)
      setModalResultados(true)
    } catch (e) {
      onError?.(`Error al buscar por fechas: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  function elegir(row) {
    setModalResultados(false)
    onSeleccionarOrden?.(buildSessionFromDetalleFixed(row))
  }

  return (
    <div className="orden-busqueda-root">
      <div className="orden-busqueda-card card-pad">
        <p className="orden-busqueda-lector muted small">
          <strong>Lector óptico</strong>: puede escanear al campo No de Orden (los saltos de línea se normalizan al buscar).
        </p>
        <label className="rep-block">
          <span>No de Orden</span>
          <input
            className="orden-busqueda-orden-input"
            value={numeroOrden}
            onChange={(e) => setNumeroOrden(e.target.value)}
            placeholder="No de Orden (use lector óptico)"
            autoComplete="off"
          />
        </label>
        <label className="rep-block">
          <span>Estatus</span>
          <input
            value={estatus}
            onChange={(e) => setEstatus(e.target.value.toUpperCase())}
            placeholder="Seleccionar estatus (opcional)"
            list="estatus-orden-busqueda"
          />
          <datalist id="estatus-orden-busqueda">
            {estatusLista.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <button type="button" className="btn-buscar-orden" disabled={loading} onClick={abrirBuscar}>
          {loading ? 'Buscando…' : '🔍 BUSCAR ORDEN DE SERVICIO'}
        </button>
        <p className="muted small orden-busqueda-ayuda">
          Si deja <strong>No de Orden</strong> vacío, al pulsar buscar se abrirá el <strong>rango de fechas</strong> (igual que en la app Android).
        </p>
      </div>

      {modalFechas && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalFechas(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rango de fechas</h3>
            </div>
            <div className="modal-body form-stack">
              <p className="muted small">Formato dd/MM/yyyy (como en Android).</p>
              <label>
                Fecha inicial
                <input value={fechaIni} onChange={(e) => setFechaIni(e.target.value)} placeholder="dd/MM/yyyy" />
              </label>
              <label>
                Fecha final
                <input value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} placeholder="dd/MM/yyyy" />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalFechas(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void ejecutarBusquedaPorFechas()}>
                Buscar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalResultados && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalResultados(false)}>
          <div className="modal modal-ordenes-lista" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{tituloResultados}</h3>
            </div>
            <div className="modal-body">
              <p className="muted">{subtituloResultados}</p>
              <ul className="orden-resultados-list">
                {resultados.map((row) => {
                  const { rep, nombreCliente, serieEquipo, tipoEquipo } = row
                  return (
                    <li key={rep.id}>
                      <button type="button" className="orden-resultado-card" onClick={() => elegir(row)}>
                        <div className="orden-res-head">
                          <strong>Orden #{rep.id}</strong>
                          <span className="muted small">{rep.fecha_creacion ? String(rep.fecha_creacion).substring(0, 16) : ''}</span>
                        </div>
                        <div className="orden-res-grid">
                          <div>
                            <span className="lbl">Estatus</span>
                            <span>{rep.estatus ?? '—'}</span>
                          </div>
                          <div>
                            <span className="lbl">Técnico</span>
                            <span>{rep.tecnico ?? '—'}</span>
                          </div>
                        </div>
                        <div className="orden-res-block">
                          <span className="lbl">Cliente</span>
                          <span>{nombreCliente}</span>
                        </div>
                        <div className="orden-res-grid">
                          <div>
                            <span className="lbl">Equipo</span>
                            <span>{serieEquipo}</span>
                          </div>
                          <div>
                            <span className="lbl">Tipo</span>
                            <span>{tipoEquipo}</span>
                          </div>
                        </div>
                        {rep.descripcion_equipo ? (
                          <p className="muted small ellipsis-3">{rep.descripcion_equipo}</p>
                        ) : null}
                        <span className="muted tiny">Toque para seleccionar esta orden</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalResultados(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
