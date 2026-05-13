import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

export default function EtiquetaPublica() {
  const [sp] = useSearchParams()
  const { nombre, orden, equipo } = useMemo(
    () => ({
      nombre: sp.get('n') ?? '',
      orden: sp.get('o') ?? '',
      equipo: sp.get('e') ?? '',
    }),
    [sp],
  )

  const tieneDatos = Boolean(nombre || orden || equipo)

  return (
    <div className="etiqueta-publica-root">
      <header className="etiqueta-publica-header">
        <Link to="/" className="etiqueta-publica-volver">
          ← Inicio
        </Link>
      </header>
      <main className="etiqueta-publica-card">
        {!tieneDatos ? (
          <p className="etiqueta-publica-vacio">No hay datos en este enlace. Escanee el código QR de una etiqueta generada desde la orden de servicio.</p>
        ) : (
          <>
            <h1 className="etiqueta-publica-titulo">Orden de servicio</h1>
            <dl className="etiqueta-publica-dl">
              <div>
                <dt>Cliente</dt>
                <dd>{nombre || '—'}</dd>
              </div>
              <div>
                <dt>Número de orden</dt>
                <dd>{orden || '—'}</dd>
              </div>
              <div>
                <dt>Equipo</dt>
                <dd className="etiqueta-publica-equipo">{equipo || '—'}</dd>
              </div>
            </dl>
          </>
        )}
      </main>
    </div>
  )
}
