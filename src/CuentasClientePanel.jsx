import { useMemo, useState } from 'react'
import { fechaEntregaYmd, fechaIngresoYmd, aYmdLocalDesdeRaw } from './reparacionUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

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

function fmtFechaCuenta(v) {
  if (v == null || v === '') return null
  const s = String(v)
  return s.length > 16 ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s
}

/**
 * Pantalla de cuentas del cliente: tarjetas o tabla, con serie y fechas de la orden.
 */
export default function CuentasClientePanel({
  cliente,
  title,
  subtitle,
  cuentas,
  repsPorReparaId,
  equiposPorId = {},
  pagosCliente = [],
  loading,
  onClose,
  onSelectCuenta,
  onNuevaCuenta,
}) {
  const [vista, setVista] = useState('tarjetas')

  function repFor(reparaId) {
    if (reparaId == null || reparaId === '') return null
    return repsPorReparaId[reparaId] ?? repsPorReparaId[String(reparaId)] ?? repsPorReparaId[Number(reparaId)] ?? null
  }

  function equipoFor(rep) {
    if (!rep?.equipo_id) return null
    return equiposPorId[String(rep.equipo_id)] ?? equiposPorId[Number(rep.equipo_id)] ?? null
  }

  const ymdPagoPorCuenta = useMemo(() => {
    const m = new Map()
    for (const p of pagosCliente) {
      const cid = p?.cuenta_id
      if (cid == null) continue
      const y = aYmdLocalDesdeRaw(p?.created_at ?? p?.fecha ?? p?.fecha_pago)
      if (!y) continue
      const key = String(cid)
      const prev = m.get(key)
      if (!prev || y > prev) m.set(key, y)
    }
    return m
  }, [pagosCliente])

  const filas = useMemo(() => {
    return cuentas.map((cuenta) => {
      const rep = repFor(cuenta.repara_id)
      const eq = equipoFor(rep)
      const ymdPago = ymdPagoPorCuenta.get(String(cuenta.id)) ?? null
      const ymdIng = rep ? fechaIngresoYmd(rep) : null
      const ymdEnt = rep ? fechaEntregaYmd(rep, cuenta, ymdPago) : null
      const serie = eq?.serie != null && String(eq.serie).trim() !== '' ? String(eq.serie).trim() : '—'
      const tipoPago = cuenta.tipo_pago ?? cuenta.tipoPago ?? ''
      return {
        cuenta,
        rep,
        ordenLabel:
          cuenta.repara_id != null && cuenta.repara_id !== ''
            ? String(cuenta.repara_id)
            : String(cuenta.id ?? '—'),
        serie,
        fechaIngreso: formatearYmd(ymdIng),
        fechaEntrega: formatearYmd(ymdEnt),
        equipoDesc: rep?.descripcion_equipo ? String(rep.descripcion_equipo) : null,
        tipoPago,
        total: Number(cuenta.total ?? 0),
        estatus: cuenta.estatus ?? '—',
        creada: fmtFechaCuenta(cuenta.created_at ?? cuenta.createdAt),
        liquidada: fmtFechaCuenta(cuenta.fecha_liquidada ?? cuenta.fechaLiquidada),
      }
    })
  }, [cuentas, repsPorReparaId, equiposPorId, ymdPagoPorCuenta])

  return (
    <div className="cuentas-cliente-overlay" role="dialog" aria-modal="true" aria-labelledby="cuentas-cliente-heading">
      <div
        className={`cuentas-cliente-shell servicios-root${vista === 'tabla' ? ' cuentas-cliente-shell--tabla' : ''}`}
      >
        <header className="servicios-appbar">
          <button type="button" className="icon-back" onClick={onClose} aria-label="Cerrar">
            ←
          </button>
          <h1 className="servicios-appbar-title" id="cuentas-cliente-heading">
            {title}
          </h1>
          <span className="servicios-appbar-placeholder" aria-hidden />
        </header>

        <div className="servicios-body cuentas-cliente-body">
          <section className="cuentas-cliente-resumen cuentas-cliente-tile">
            <h2 className="cuentas-cliente-nombre">{cliente?.nombre || 'Cliente'}</h2>
            <p className="cuentas-cliente-meta">📞 {cliente?.telefono || 'Sin teléfono'}</p>
            {cliente?.domicilio ? <p className="cuentas-cliente-meta muted">🏠 {cliente.domicilio}</p> : null}
            {cliente?.correo ? <p className="cuentas-cliente-meta muted">✉️ {cliente.correo}</p> : null}
          </section>

          {subtitle && title !== 'Error' ? <p className="cuentas-cliente-lead">{subtitle}</p> : null}

          {!loading && cuentas.length > 0 ? (
            <div className="cuentas-cliente-vista-bar" role="group" aria-label="Forma de ver las cuentas">
              <button
                type="button"
                className={`cuentas-cliente-vista-btn${vista === 'tarjetas' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                onClick={() => setVista('tarjetas')}
                aria-pressed={vista === 'tarjetas'}
              >
                🗂️ Tarjetas
              </button>
              <button
                type="button"
                className={`cuentas-cliente-vista-btn${vista === 'tabla' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                onClick={() => setVista('tabla')}
                aria-pressed={vista === 'tabla'}
              >
                📊 Tabla
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="cuentas-cliente-loading">
              <p>Cargando…</p>
            </div>
          ) : cuentas.length === 0 ? (
            <div className="cuentas-cliente-empty empty-card">
              <p>{title === 'Error' ? subtitle || 'Error al buscar cuentas' : 'No se encontraron cuentas para este cliente'}</p>
            </div>
          ) : vista === 'tabla' ? (
            <TablaScrollSuperior
              ariaLabel="Cuentas del cliente en tabla"
              classNameWrap="cuentas-cliente-tabla-wrap"
              syncDeps={[vista, filas, loading]}
            >
              <table className="cuentas-cliente-tabla">
                <thead>
                  <tr>
                    <th>No. orden</th>
                    <th>Serie equipo</th>
                    <th>Fecha ingreso</th>
                    <th>Fecha entrega</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Tipo pago</th>
                    <th aria-label="Abrir cuenta">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.cuenta.id} className="cuentas-cliente-tabla-fila">
                      <td className="cuentas-cliente-tabla-orden">{f.ordenLabel}</td>
                      <td>{f.serie}</td>
                      <td className="cuentas-cliente-tabla-fecha">{f.fechaIngreso}</td>
                      <td
                        className={`cuentas-cliente-tabla-fecha${f.fechaEntrega !== '—' ? ' cuentas-cliente-tabla-fecha--entrega' : ''}`}
                      >
                        {f.fechaEntrega}
                      </td>
                      <td className="cuentas-cliente-tabla-total">${f.total.toFixed(2)}</td>
                      <td>
                        <span className="cuentas-cliente-estatus-pill">{f.estatus}</span>
                      </td>
                      <td>{f.tipoPago || '—'}</td>
                      <td className="cuentas-cliente-tabla-acciones">
                        <button
                          type="button"
                          className="cuentas-cliente-btn-abrir"
                          onClick={() => onSelectCuenta?.(f.cuenta)}
                          title="Abrir cuenta"
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
            <ul className="cuentas-cliente-list">
              {filas.map((f) => (
                <li key={f.cuenta.id}>
                  <button type="button" className="cuenta-tarjeta-android cuentas-cliente-tile" onClick={() => onSelectCuenta?.(f.cuenta)}>
                    <strong className="cuenta-tarjeta-titulo">No. orden: {f.ordenLabel}</strong>
                    {f.cuenta.id != null ? (
                      <span className="cuenta-tarjeta-linea muted small">ID cuenta: {f.cuenta.id}</span>
                    ) : null}
                    <span className="cuenta-tarjeta-linea cuenta-tarjeta-linea--dato">
                      <span className="cuenta-tarjeta-etiqueta">Serie:</span> {f.serie}
                    </span>
                    <span className="cuenta-tarjeta-linea cuenta-tarjeta-linea--dato">
                      <span className="cuenta-tarjeta-etiqueta">Ingreso:</span> {f.fechaIngreso}
                    </span>
                    <span className="cuenta-tarjeta-linea cuenta-tarjeta-linea--dato">
                      <span className="cuenta-tarjeta-etiqueta">Entrega:</span> {f.fechaEntrega}
                    </span>
                    {f.equipoDesc ? (
                      <span className="cuenta-tarjeta-linea muted small">Equipo: {f.equipoDesc}</span>
                    ) : null}
                    {f.tipoPago ? (
                      <span className="cuenta-tarjeta-linea muted small">Tipo de pago: {f.tipoPago}</span>
                    ) : null}
                    <span className="cuenta-tarjeta-linea muted small">Total: ${f.total.toFixed(2)}</span>
                    <span className="cuenta-tarjeta-linea muted small">Estado: {f.estatus}</span>
                    {f.creada ? <span className="cuenta-tarjeta-linea muted tiny">Cuenta creada: {f.creada}</span> : null}
                    {f.liquidada ? <span className="cuenta-tarjeta-linea muted tiny">Liquidada: {f.liquidada}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="cuentas-cliente-footer">
            <button type="button" className="btn-nueva-cuenta-cliente" onClick={onNuevaCuenta}>
              Nueva Cuenta
            </button>
            <button type="button" className="btn-cerrar-cuentas-cliente" onClick={onClose}>
              Cerrar
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
