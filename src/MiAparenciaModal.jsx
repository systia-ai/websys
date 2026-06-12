import { useEffect, useMemo, useState } from 'react'
import {
  aplicarAppConfigEnDom,
  fusionarConfigConPreferencias,
  preferenciasTienenCambios,
} from './appConfig.js'
import { useAppConfig } from './AppConfigContext.jsx'

function CampoColor({ label, value, onChange, disabled }) {
  return (
    <label className="admin-app-config-campo admin-app-config-campo--color">
      <span className="admin-app-config-label">{label}</span>
      <div className="admin-app-config-color-row">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} selector`}
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          spellCheck={false}
        />
      </div>
    </label>
  )
}

export default function MiAparenciaModal({ open, onClose, onNotice, onError }) {
  const {
    configBranding,
    preferenciasUsuario,
    guardarPreferencias,
    restablecerPreferencias,
    guardando,
  } = useAppConfig()
  const [borrador, setBorrador] = useState({ ...preferenciasUsuario })

  useEffect(() => {
    if (open) setBorrador({ ...preferenciasUsuario })
  }, [open, preferenciasUsuario])

  useEffect(() => {
    if (!open) return
    aplicarAppConfigEnDom(fusionarConfigConPreferencias(configBranding, borrador))
  }, [open, borrador, configBranding])

  useEffect(() => {
    if (!open) return
    return () => aplicarAppConfigEnDom(fusionarConfigConPreferencias(configBranding, preferenciasUsuario))
  }, [open, configBranding, preferenciasUsuario])

  const hayCambios = useMemo(
    () => preferenciasTienenCambios(borrador, preferenciasUsuario),
    [borrador, preferenciasUsuario],
  )

  if (!open) return null

  function patch(cambios) {
    setBorrador((prev) => ({ ...prev, ...cambios }))
  }

  async function guardar() {
    try {
      await guardarPreferencias(borrador)
      onNotice?.('Su apariencia se guardó solo para su usuario.')
      onClose?.()
    } catch (e) {
      onError?.(`No se pudo guardar: ${e.message}`)
    }
  }

  async function restablecer() {
    if (!confirm('¿Restablecer modo oscuro y colores a los valores predeterminados?')) return
    try {
      await restablecerPreferencias()
      onNotice?.('Apariencia restablecida.')
      onClose?.()
    } catch (e) {
      onError?.(`No se pudo restablecer: ${e.message}`)
    }
  }

  return (
    <div className="modal-backdrop mi-apariencia-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide mi-apariencia-modal"
        role="dialog"
        aria-labelledby="mi-apariencia-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="mi-apariencia-titulo">🎨 Mi apariencia</h3>
        </div>
        <div className="modal-body form-stack">
          <p className="muted small">
            Modo oscuro y colores se guardan solo para su cuenta. Los textos, logo y nombre de la empresa son
            iguales para todos y los configura el administrador.
          </p>
          <label className="admin-app-config-toggle mi-apariencia-modo-oscuro">
            <input
              type="checkbox"
              checked={Boolean(borrador.modoOscuro)}
              disabled={guardando}
              onChange={(e) => patch({ modoOscuro: e.target.checked })}
            />
            <span className="mi-apariencia-modo-oscuro-texto">
              <span className="mi-apariencia-modo-oscuro-emoji" aria-hidden="true">
                🌙
              </span>
              Modo oscuro
            </span>
          </label>
          <div className="admin-app-config-grid admin-app-config-grid--colores">
            <CampoColor
              label="Color primario"
              value={borrador.colorPrimario}
              disabled={guardando}
              onChange={(v) => patch({ colorPrimario: v })}
            />
            <CampoColor
              label="Color primario oscuro"
              value={borrador.colorPrimarioOscuro}
              disabled={guardando}
              onChange={(v) => patch({ colorPrimarioOscuro: v })}
            />
            <CampoColor
              label="Color acento"
              value={borrador.colorAcento}
              disabled={guardando}
              onChange={(v) => patch({ colorAcento: v })}
            />
            <CampoColor
              label="Fondo general (modo claro)"
              value={borrador.colorFondoApp}
              disabled={guardando}
              onChange={(v) => patch({ colorFondoApp: v })}
            />
          </div>
        </div>
        <div className="modal-footer modal-footer-wrap">
          <button type="button" className="secondary" disabled={guardando} onClick={() => void restablecer()}>
            ↺ Restablecer
          </button>
          <button type="button" className="secondary" disabled={guardando} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={guardando || !hayCambios}
            onClick={() => void guardar()}
          >
            {guardando ? 'Guardando…' : '💾 Guardar mi apariencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
