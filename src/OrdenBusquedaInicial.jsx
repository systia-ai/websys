import { useMemo, useState } from 'react'
import { ESTATUS_ORDEN } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

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

/** Coincidencia por texto en orden, cliente y equipo (no por ID numérico). */
function repCoincideBusquedaTexto(rep, term, clientes, equipos) {
  const t = String(term ?? '').trim().toUpperCase()
  if (!t) return false
  const cli = clientes.find((c) => sameId(c.id, rep.cliente_id))
  const eq = equipos.find((e) => sameId(e.id, rep.equipo_id))
  const campos = [
    rep.descripcion_equipo,
    rep.problemas_reportados,
    cli?.nombre,
    eq?.serie,
    eq?.tipo_equipo,
    eq?.descripcion,
  ]
  return campos.some((v) => String(v ?? '').toUpperCase().includes(t))
}

function formatearFechaRep(rep) {
  const f = rep?.fecha_creacion ?? rep?.fechaCreacion ?? ''
  if (!f) return '—'
  const s = String(f)
  const head = s.substring(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const [y, m, d] = head.split('-')
    return `${d}/${m}/${y}`
  }
  if (s.length >= 16) return s.substring(0, 16).replace('T', ' ')
  return s.substring(0, 10)
}

function esEntregada(est) {
  return /ENTREGAD/i.test(String(est ?? ''))
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
        lista = reps
          .filter((r) => repCoincideBusquedaTexto(r, no, clientes, equipos))
          .map((r) => mapConClienteRow(r, clientes, equipos))
        if (st) {
          lista = lista.filter((row) => String(row.rep.estatus ?? '').toUpperCase() === st.toUpperCase())
        }
        setTituloResultados(`Órdenes Encontradas (${lista.length})`)
        setSubtituloResultados(
          lista.length
            ? 'Selecciona una orden para cargar sus datos:'
            : st
              ? `No se encontraron órdenes con '${no}' y estatus '${st}'`
              : `No se encontraron órdenes con: ${no}`,
        )
      }

      if (!lista.length) {
        onError?.(
          st
            ? `No se encontraron órdenes con '${no}' y estatus '${st}'`
            : `No se encontraron órdenes con: ${no}`,
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
        <header className="orden-busqueda-header">
          <span className="orden-busqueda-header-emoji" aria-hidden="true">
            📋
          </span>
          <h2 className="orden-busqueda-titulo">Buscar orden de servicio</h2>
        </header>

        <label className="orden-busqueda-campo">
          <span className="orden-busqueda-campo-label">
            <span className="orden-busqueda-campo-ico" aria-hidden="true">
              🔍
            </span>
            Buscar orden
          </span>
          <div className="orden-busqueda-input-wrap orden-busqueda-input-wrap--principal">
            <input
              className="orden-busqueda-orden-input"
              value={numeroOrden}
              onChange={(e) => setNumeroOrden(e.target.value)}
              placeholder="Nº orden, cliente, serie o tipo de equipo"
              autoComplete="off"
            />
          </div>
        </label>

        <label className="orden-busqueda-campo">
          <span className="orden-busqueda-campo-label">
            <span className="orden-busqueda-campo-ico" aria-hidden="true">
              📌
            </span>
            Estatus
          </span>
          <div className="orden-busqueda-input-wrap">
            <input
              value={estatus}
              onChange={(e) => setEstatus(e.target.value.toUpperCase())}
              placeholder="Opcional — ej. ENTREGADO"
              list="estatus-orden-busqueda"
            />
          </div>
          <datalist id="estatus-orden-busqueda">
            {estatusLista.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <button type="button" className="btn-buscar-orden" disabled={loading} onClick={abrirBuscar}>
          {loading ? '⏳ Buscando…' : '🔍 Buscar orden de servicio'}
        </button>

        <div className="orden-busqueda-tip orden-busqueda-tip--ayuda">
          <span className="orden-busqueda-tip-ico" aria-hidden="true">
            💡
          </span>
          <p className="orden-busqueda-ayuda">
            Por <strong>🔢 número</strong> (exacto si es solo números), <strong>👤 cliente</strong>,{' '}
            <strong>🏷️ serie</strong> o <strong>🖨️ tipo de equipo</strong>. Campo vacío →{' '}
            <strong>📅 rango de fechas</strong>.
          </p>
        </div>
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
              <p className="muted orden-resultados-sub">{subtituloResultados}</p>
              <TablaScrollSuperior
                ariaLabel="Órdenes encontradas"
                classNameWrap="orden-resultados-tabla-wrap cuentas-cliente-tabla-wrap"
                syncDeps={[resultados, modalResultados]}
              >
                <table className="cuentas-cliente-tabla orden-resultados-tabla">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Fecha</th>
                      <th>Estatus</th>
                      <th>Técnico</th>
                      <th>Cliente</th>
                      <th>Serie</th>
                      <th>Tipo</th>
                      <th>Modelo / descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.map((row) => {
                      const { rep, nombreCliente, serieEquipo, tipoEquipo } = row
                      const ent = esEntregada(rep.estatus)
                      const st = String(rep.estatus ?? '—').trim()
                      return (
                        <tr
                          key={rep.id}
                          className="orden-resultados-fila orden-resultados-fila--clic"
                          title={`Seleccionar orden #${rep.id}`}
                          onClick={() => elegir(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              elegir(row)
                            }
                          }}
                          tabIndex={0}
                          role="button"
                        >
                          <td className="cuentas-cliente-tabla-orden orden-resultados-num">{rep.id ?? '—'}</td>
                          <td className="cuentas-cliente-tabla-fecha">{formatearFechaRep(rep)}</td>
                          <td>
                            <span
                              className={`rep-orden-badge rep-orden-badge--tabla${ent ? ' rep-orden-badge--entregada' : ' rep-orden-badge--activa'}`}
                            >
                              {st}
                            </span>
                          </td>
                          <td className="orden-resultados-tecnico">{rep.tecnico ?? '—'}</td>
                          <td className="orden-resultados-cliente">{nombreCliente}</td>
                          <td className="orden-resultados-serie">{serieEquipo}</td>
                          <td>{tipoEquipo}</td>
                          <td className="orden-resultados-modelo">{rep.descripcion_equipo ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TablaScrollSuperior>
              <p className="muted tiny orden-resultados-hint">Toque una fila para cargar la orden</p>
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
