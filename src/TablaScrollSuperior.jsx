import { useCallback, useEffect, useRef } from 'react'

const HINT_DEFAULT = 'Desliza horizontalmente arriba o en la tabla →'

/**
 * Tabla (o grid) con desplazamiento horizontal: barra sincronizada arriba + panel principal.
 */
export default function TablaScrollSuperior({
  children,
  ariaLabel = 'Tabla',
  hint = HINT_DEFAULT,
  showHint = true,
  classNameWrap = '',
  classNameScroll = '',
  syncDeps = [],
}) {
  const mainRef = useRef(null)
  const topRef = useRef(null)

  const syncFromMain = useCallback(() => {
    const main = mainRef.current
    const top = topRef.current
    if (main && top && top.scrollLeft !== main.scrollLeft) {
      top.scrollLeft = main.scrollLeft
    }
  }, [])

  const syncFromTop = useCallback(() => {
    const main = mainRef.current
    const top = topRef.current
    if (main && top && main.scrollLeft !== top.scrollLeft) {
      main.scrollLeft = top.scrollLeft
    }
  }, [])

  useEffect(() => {
    const main = mainRef.current
    const inner = topRef.current?.querySelector('.inventario-tabla-scroll-top-inner')
    if (!main || !inner) return
    const ajustar = () => {
      inner.style.minWidth = `${main.scrollWidth}px`
    }
    ajustar()
    const t = window.setTimeout(ajustar, 0)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null
    ro?.observe(main)
    return () => {
      window.clearTimeout(t)
      ro?.disconnect()
    }
  }, syncDeps)

  const wrapClass = ['tabla-scroll-wrap', 'inventario-tabla-wrap', classNameWrap].filter(Boolean).join(' ')
  const scrollClass = ['inventario-tabla-scroll', classNameScroll].filter(Boolean).join(' ')

  return (
    <div className={wrapClass}>
      {showHint && hint ? <p className="inventario-tabla-scroll-hint muted small">{hint}</p> : null}
      <div
        ref={topRef}
        className="inventario-tabla-scroll-top"
        aria-hidden="true"
        onScroll={syncFromTop}
      >
        <div className="inventario-tabla-scroll-top-inner" />
      </div>
      <div
        ref={mainRef}
        className={scrollClass}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={syncFromMain}
      >
        {children}
      </div>
    </div>
  )
}
