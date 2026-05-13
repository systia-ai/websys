/**
 * Catálogo local de técnicos (lista controlada por el usuario).
 * Persiste en localStorage y permite agregar/eliminar.
 *
 * Formato de almacenamiento en `reparaciones.tecnico`:
 *   - Un técnico:    "JUAN"
 *   - Dos técnicos:  "JUAN & VERO"
 */

const LS_KEY = 'sistefix_local_tecnicos'
const DEFAULT_TECNICOS = ['ANDRES', 'ARTURO', 'VERO', 'JUAN', 'MIGUEL']

function normalizar(t) {
  return String(t ?? '').trim().toUpperCase()
}

export function leerTecnicos() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw == null) return [...DEFAULT_TECNICOS]
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return [...DEFAULT_TECNICOS]
    const limpios = [...new Set(list.map(normalizar).filter(Boolean))]
    return limpios.length > 0 ? limpios : [...DEFAULT_TECNICOS]
  } catch {
    return [...DEFAULT_TECNICOS]
  }
}

export function guardarTecnicos(list) {
  const limpios = [...new Set((list ?? []).map(normalizar).filter(Boolean))]
  localStorage.setItem(LS_KEY, JSON.stringify(limpios))
  return limpios
}

export function agregarTecnico(nombre) {
  const n = normalizar(nombre)
  if (!n) return leerTecnicos()
  const lista = leerTecnicos()
  if (lista.includes(n)) return lista
  return guardarTecnicos([...lista, n])
}

export function eliminarTecnico(nombre) {
  const n = normalizar(nombre)
  const lista = leerTecnicos().filter((t) => t !== n)
  return guardarTecnicos(lista)
}

/** Combina hasta 2 técnicos en una cadena con " & ". */
export function combinarTecnicos(a, b) {
  const x = normalizar(a)
  const y = normalizar(b)
  if (x && y && x !== y) return `${x} & ${y}`
  return x || y || ''
}

/** Separa una cadena "X & Y" en sus dos partes. */
export function separarTecnicos(s) {
  const raw = String(s ?? '').trim()
  if (!raw) return ['', '']
  const partes = raw.split(/\s*&\s*/).map(normalizar).filter(Boolean)
  return [partes[0] ?? '', partes[1] ?? '']
}
