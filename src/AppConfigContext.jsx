import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from './supabaseClient.js'
import {
  APP_CONFIG_DEFECTO,
  PREFERENCIAS_USUARIO_DEFECTO,
  aplicarAppConfigEnDom,
  fusionarConfigConPreferencias,
  normalizarConfigBranding,
  urlBannerEfectiva,
  urlLoginLogoEfectiva,
  urlLogoEfectiva,
} from './appConfig.js'
import {
  cargarAppConfigServidor,
  eliminarImagenBranding,
  guardarAppConfigServidor,
  restablecerAppConfigServidor,
  subirImagenBranding,
} from './appConfigApi.js'
import {
  cargarPreferenciasUsuarioServidor,
  guardarPreferenciasUsuarioServidor,
  restablecerPreferenciasUsuarioServidor,
} from './userPreferencesApi.js'

const AppConfigContext = createContext(null)

export function useAppConfig() {
  const ctx = useContext(AppConfigContext)
  if (!ctx) {
    throw new Error('useAppConfig debe usarse dentro de AppConfigProvider')
  }
  return ctx
}

export function AppConfigProvider({ children }) {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [configBranding, setConfigBranding] = useState(() => normalizarConfigBranding(APP_CONFIG_DEFECTO))
  const [preferenciasUsuario, setPreferenciasUsuario] = useState(() => ({ ...PREFERENCIAS_USUARIO_DEFECTO }))
  const [userId, setUserId] = useState(null)
  const [ready, setReady] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const config = useMemo(
    () => fusionarConfigConPreferencias(configBranding, preferenciasUsuario),
    [configBranding, preferenciasUsuario],
  )

  const aplicarEfectiva = useCallback(
    (branding, preferencias) => {
      aplicarAppConfigEnDom(fusionarConfigConPreferencias(branding, preferencias))
    },
    [],
  )

  const recargarBranding = useCallback(async () => {
    const cargada = await cargarAppConfigServidor(supabase)
    const normalizada = normalizarConfigBranding(cargada)
    setConfigBranding(normalizada)
    return normalizada
  }, [supabase])

  const recargarPreferencias = useCallback(
    async (uid = userId) => {
      if (!uid) {
        const defecto = { ...PREFERENCIAS_USUARIO_DEFECTO }
        setPreferenciasUsuario(defecto)
        return defecto
      }
      const cargada = await cargarPreferenciasUsuarioServidor(supabase, uid)
      setPreferenciasUsuario(cargada)
      return cargada
    },
    [supabase, userId],
  )

  const recargar = useCallback(async () => {
    const branding = await recargarBranding()
    const prefs = await recargarPreferencias(userId)
    aplicarEfectiva(branding, prefs)
    return fusionarConfigConPreferencias(branding, prefs)
  }, [recargarBranding, recargarPreferencias, userId, aplicarEfectiva])

  useEffect(() => {
    if (!supabase) return undefined
    let cancelado = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelado) setUserId(data.session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => {
      cancelado = true
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    let cancelado = false
    void (async () => {
      try {
        const branding = await recargarBranding()
        const prefs = userId
          ? await cargarPreferenciasUsuarioServidor(supabase, userId)
          : { ...PREFERENCIAS_USUARIO_DEFECTO }
        if (cancelado) return
        setPreferenciasUsuario(prefs)
        aplicarEfectiva(branding, prefs)
      } finally {
        if (!cancelado) setReady(true)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [supabase, userId, recargarBranding, aplicarEfectiva])

  useEffect(() => {
    aplicarEfectiva(configBranding, preferenciasUsuario)
  }, [configBranding, preferenciasUsuario, aplicarEfectiva])

  const guardarBranding = useCallback(
    async (parcial) => {
      setGuardando(true)
      try {
        const next = normalizarConfigBranding({ ...configBranding, ...parcial })
        const guardado = await guardarAppConfigServidor(supabase, next)
        setConfigBranding(guardado)
        aplicarEfectiva(guardado, preferenciasUsuario)
        return guardado
      } finally {
        setGuardando(false)
      }
    },
    [supabase, configBranding, preferenciasUsuario, aplicarEfectiva],
  )

  const guardarPreferencias = useCallback(
    async (parcial) => {
      if (!userId) {
        throw new Error('Debe iniciar sesión para guardar su apariencia.')
      }
      setGuardando(true)
      try {
        const next = { ...preferenciasUsuario, ...parcial }
        const guardado = await guardarPreferenciasUsuarioServidor(supabase, userId, next)
        setPreferenciasUsuario(guardado)
        aplicarEfectiva(configBranding, guardado)
        return guardado
      } finally {
        setGuardando(false)
      }
    },
    [supabase, userId, preferenciasUsuario, configBranding, aplicarEfectiva],
  )

  const subirImagen = useCallback(
    async (file, tipo) => {
      const url = await subirImagenBranding(supabase, file, tipo)
      const campo =
        tipo === 'logo' ? 'logoUrl' : tipo === 'banner' ? 'bannerUrl' : 'loginLogoUrl'
      return guardarBranding({ [campo]: url })
    },
    [guardarBranding, supabase],
  )

  const eliminarImagen = useCallback(
    async (tipo) => {
      await eliminarImagenBranding(supabase, tipo)
      const campo =
        tipo === 'logo' ? 'logoUrl' : tipo === 'banner' ? 'bannerUrl' : 'loginLogoUrl'
      return guardarBranding({ [campo]: null })
    },
    [guardarBranding, supabase],
  )

  const restablecerBranding = useCallback(async () => {
    setGuardando(true)
    try {
      const defecto = await restablecerAppConfigServidor(supabase)
      setConfigBranding(defecto)
      aplicarEfectiva(defecto, preferenciasUsuario)
      return defecto
    } finally {
      setGuardando(false)
    }
  }, [supabase, preferenciasUsuario, aplicarEfectiva])

  const restablecerPreferencias = useCallback(async () => {
    if (!userId) return { ...PREFERENCIAS_USUARIO_DEFECTO }
    setGuardando(true)
    try {
      const defecto = await restablecerPreferenciasUsuarioServidor(supabase, userId)
      setPreferenciasUsuario(defecto)
      aplicarEfectiva(configBranding, defecto)
      return defecto
    } finally {
      setGuardando(false)
    }
  }, [supabase, userId, configBranding, aplicarEfectiva])

  const value = useMemo(
    () => ({
      config,
      configBranding,
      preferenciasUsuario,
      userId,
      ready,
      guardando,
      recargar,
      guardar: guardarBranding,
      guardarBranding,
      guardarPreferencias,
      subirImagen,
      eliminarImagen,
      restablecer: restablecerBranding,
      restablecerBranding,
      restablecerPreferencias,
      logoUrl: urlLogoEfectiva(config),
      bannerUrl: urlBannerEfectiva(config),
      loginLogoUrl: urlLoginLogoEfectiva(config),
    }),
    [
      config,
      configBranding,
      preferenciasUsuario,
      userId,
      ready,
      guardando,
      recargar,
      guardarBranding,
      guardarPreferencias,
      subirImagen,
      eliminarImagen,
      restablecerBranding,
      restablecerPreferencias,
    ],
  )

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>
}
