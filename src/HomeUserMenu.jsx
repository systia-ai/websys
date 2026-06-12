import { useEffect, useRef, useState } from 'react'

export default function HomeUserMenu({ email, rolUsuario, onMiAparencia, onSignOut }) {
  const [abierto, setAbierto] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    function cerrarSiFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setAbierto(false)
      }
    }
    function cerrarConEscape(e) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', cerrarSiFuera)
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.removeEventListener('mousedown', cerrarSiFuera)
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [abierto])

  const rolClass = `home-header-role home-header-role--${String(rolUsuario).toLowerCase()}`

  return (
    <div className="home-header-session">
      <div className="home-user-menu" ref={menuRef}>
        <button
          type="button"
          className="home-header-user home-user-menu-trigger"
          aria-expanded={abierto}
          aria-haspopup="menu"
          aria-controls="home-user-menu-panel"
          onClick={() => setAbierto((v) => !v)}
        >
          <span className="home-header-user-emoji" aria-hidden="true">
            👤
          </span>
          <span className="home-header-user-email">{email}</span>
          <span className={`home-user-menu-chevron${abierto ? ' home-user-menu-chevron--open' : ''}`} aria-hidden="true">
            ▾
          </span>
        </button>
        {abierto ? (
          <div id="home-user-menu-panel" className="home-user-menu-dropdown" role="menu">
            <div className="home-user-menu-dropdown-item home-user-menu-dropdown-item--rol" role="none">
              <span className={rolClass}>Rol: {rolUsuario}</span>
            </div>
            <button
              type="button"
              className="home-user-menu-dropdown-item"
              role="menuitem"
              onClick={() => {
                setAbierto(false)
                onMiAparencia?.()
              }}
            >
              🎨 Mi apariencia
            </button>
            <button
              type="button"
              className="home-user-menu-dropdown-item home-user-menu-dropdown-item--signout"
              role="menuitem"
              onClick={() => {
                setAbierto(false)
                onSignOut?.()
              }}
            >
              Cerrar sesión
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
