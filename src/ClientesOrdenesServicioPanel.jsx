import { useMemo, useState } from 'react'
import { isReparacionActiva } from './reparacionUtils.js'
import { aYmdLocalDesdeRaw, fechaEntregaYmd, fechaIngresoYmd } from './reparacionUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

const LS_VISTA_ORDENES_CLIENTE = 'sistefix_clientes_ordenes_vista'

function leerVistaOrdenes() {
  try {
    return localStorage.getItem(LS_VISTA_ORDENES_CLIENTE) === 'tabla' ? 'tabla' : 'tarjetas'
  } catch {
    return 'tarjetas'
  }
}

function formatearYmd(ymdOrNull) {
  if (!ymdOrNull || String(ymdOrNull).length < 10) return '—'
  const [y, m, d] = String(ymdOrNull).slice(0, 10).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Lista de órdenes del cliente (tarjetas o tabla) con serie y fechas.
 */
export default function ClientesOrdenesServicioPanel({
  loading,
  errorSubtitle,
  repResumen,
  reparaciones = [],
  equiposPorId = {},
  cuentasPorReparaId = {},
  pagosPorCuentaId = {},
  onSelectRep,
}) {
  const [vista, setVista] = useState(leerVistaOrdenes)

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_ORDENES_CLIENTE, modo)
    } catch {
      /* ignore */
    }
  }

  function equipoFor(rep) {
    if (!rep?.equipo_id) return null
    return equiposPorId[String(rep.equipo_id)] ?? equiposPorId[Number(rep.equipo_id)] ?? null
  }

  function cuentaFor(rep) {
    if (rep?.id == null) return null
    return (
      cuentasPorReparaId[String(rep.id)] ??
      cuentasPorReparaId[Number(rep.id)] ??
      null
    )
  }

  const filas = useMemo(() => {
    return reparaciones.map((rep) => {
      const activa = isReparacionActiva(rep)
      const eq = equipoFor(rep)
      const cuenta = cuentaFor(rep)
      const ymdPago = cuenta?.id != null ? pagosPorCuentaId[String(cuenta.id)] ?? null : null
      const ymdIng = fechaIngresoYmd(rep)
      const ymdSal = fechaEntregaYmd(rep, cuenta, ymdPago)
      const serie = eq?.serie != null && String(eq.serie).trim() !== '' ? String(eq.serie).trim() : '—'
      return {
        rep,
        activa,
        ordenId: rep.id ?? '—',
        serie,
        fechaIngreso: formatearYmd(ymdIng),
        fechaSalida: formatearYmd(ymdSal),
        tipo: rep.tipo_reparacion ? String(rep.tipo_reparacion) : null,
        equipo: rep.descripcion_equipo ? String(rep.descripcion_equipo) : null,
        problema: rep.problemas_reportados ? String(rep.problemas_reportados) : null,
        estatus: rep.estatus ?? 'Sin estado',
      }
    })
  }, [reparaciones, equiposPorId, cuentasPorReparaId, pagosPorCuentaId])

  if (loading) {
    return <p className="center">Cargando…</p>
  }

  if (errorSubtitle) {
    return <p className="warning-inline">{errorSubtitle}</p>
  }

  return (
    <>
      {repResumen ? (
        repResumen.total > 0 ? (
          <div className="rep-ordenes-resumen-caja" role="status" aria-live="polite">
            <div className="rep-ordenes-resumen-cliente">
              <span className="rep-ordenes-resumen-ico" aria-hidden>
                👤
              </span>
              <span className="rep-ordenes-resumen-nombre">{repResumen.nombre}</span>
            </div>
            <div className="rep-ordenes-resumen-stats">
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--total">
                <span aria-hidden>📋</span> {repResumen.total}{' '}
                {repResumen.total === 1 ? 'orden' : 'órdenes'}
              </span>
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--taller">
                <span aria-hidden>🔧</span> {repResumen.enTaller} en taller
              </span>
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--ok">
                <span aria-hidden>✅</span> {repResumen.entregadas}{' '}
                {repResumen.entregadas === 1 ? 'entregada' : 'entregadas'}
              </span>
            </div>
          </div>
        ) : (
          <div className="rep-ordenes-resumen-caja rep-ordenes-resumen-caja--vacio" role="status" aria-live="polite">
            <div className="rep-ordenes-resumen-cliente">
              <span className="rep-ordenes-resumen-ico" aria-hidden>
                👤
              </span>
              <span className="rep-ordenes-resumen-nombre">{repResumen.nombre}</span>
            </div>
            <p className="rep-ordenes-resumen-vacio-msg">Sin órdenes de servicio registradas.</p>
            <p className="rep-ordenes-resumen-vacio-sugerencia">Pulse «Nueva reparación» para registrar la primera orden.</p>
          </div>
        )
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="cuentas-cliente-vista-bar clientes-ordenes-vista-bar" role="group" aria-label="Forma de ver las órdenes">
            <button
              type="button"
              className={`cuentas-cliente-vista-btn${vista === 'tarjetas' ? ' cuentas-cliente-vista-btn--active' : ''}`}
              onClick={() => cambiarVista('tarjetas')}
              aria-pressed={vista === 'tarjetas'}
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

          {vista === 'tabla' ? (
            <TablaScrollSuperior
              ariaLabel="Órdenes del cliente en tabla"
              classNameWrap="cuentas-cliente-tabla-wrap clientes-ordenes-tabla-wrap"
              syncDeps={[vista, filas, loading]}
            >
              <table className="cuentas-cliente-tabla clientes-ordenes-tabla">
                <thead>
                  <tr>
                    <th>No. orden</th>
                    <th>Serie</th>
                    <th>Fecha ingreso</th>
                    <th>Fecha salida</th>
                    <th>Estado</th>
                    <th>Tipo</th>
                    <th>Equipo</th>
                    <th aria-label="Abrir orden">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.rep.id}
                      className={`clientes-ordenes-tabla-fila clientes-ordenes-tabla-fila--clic${f.activa ? '' : ' clientes-ordenes-fila--entregada'}`}
                      role="button"
                      tabIndex={0}
                      title={`Abrir orden #${f.ordenId}`}
                      onClick={() => onSelectRep?.(f.rep)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectRep?.(f.rep)
                        }
                      }}
                    >
                      <td className="cuentas-cliente-tabla-orden">{f.ordenId}</td>
                      <td>{f.serie}</td>
                      <td className="cuentas-cliente-tabla-fecha">{f.fechaIngreso}</td>
                      <td
                        className={`cuentas-cliente-tabla-fecha${f.fechaSalida !== '—' ? ' cuentas-cliente-tabla-fecha--entrega' : ''}`}
                      >
                        {f.fechaSalida}
                      </td>
                      <td>
                        <span
                          className={`rep-orden-badge rep-orden-badge--tabla${f.activa ? ' rep-orden-badge--activa' : ' rep-orden-badge--entregada'}`}
                        >
                          {f.activa ? 'En taller' : 'Entregada'}
                        </span>
                      </td>
                      <td>{f.tipo || '—'}</td>
                      <td className="clientes-ordenes-col-texto">{f.equipo || '—'}</td>
                      <td className="cuentas-cliente-tabla-acciones">
                        <button
                          type="button"
                          className="cuentas-cliente-btn-abrir"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectRep?.(f.rep)
                          }}
                        >
                          Ver →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablaScrollSuperior>
          ) : (
            <ul className="rep-activa-list">
              {filas.map((f) => (
                <li key={f.rep.id}>
                  <button
                    type="button"
                    className={`rep-activa-card cuentas-cliente-tile${f.activa ? '' : ' rep-orden-entregada'}`}
                    onClick={() => onSelectRep?.(f.rep)}
                  >
                    <span
                      className={`rep-orden-badge${f.activa ? ' rep-orden-badge--activa' : ' rep-orden-badge--entregada'}`}
                    >
                      {f.activa ? 'En taller' : 'Entregada'}
                    </span>
                    <strong>🔧 Orden #{f.ordenId}</strong>
                    <span className="rep-activa-dato">
                      <span className="rep-activa-etiqueta">Serie:</span> {f.serie}
                    </span>
                    <span className="rep-activa-dato">
                      <span className="rep-activa-etiqueta">Ingreso:</span> {f.fechaIngreso}
                    </span>
                    <span className="rep-activa-dato">
                      <span className="rep-activa-etiqueta">Salida:</span> {f.fechaSalida}
                    </span>
                    {f.tipo ? <span className="small">🔧 Tipo: {f.tipo}</span> : null}
                    {f.equipo ? <span className="small">📝 {f.equipo}</span> : null}
                    {f.problema ? <span className="small">⚠️ {f.problema}</span> : null}
                    <span className="small">📊 Estado: {f.estatus}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </>
  )
}
