import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from './supabaseClient.js'
import { useAppConfig } from './AppConfigContext.jsx'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}

function LoginAvatar() {
  return (
    <div className="auth-login-avatar" aria-hidden>
      <span className="auth-login-avatar-orbit" />
      <span className="auth-login-avatar-s">S</span>
    </div>
  )
}

function LoginScreen({ supabase, onSignedIn }) {
  const { config } = useAppConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const mail = email.trim()
    if (!mail || !password) {
      setError('Ingrese correo y contraseña.')
      return
    }
    setLoading(true)
    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      })
      if (signError) throw signError
      if (data.session) onSignedIn(data.session)
    } catch (err) {
      const msg = String(err?.message ?? err)
      if (/invalid login credentials/i.test(msg)) {
        setError('Correo o contraseña incorrectos.')
      } else if (/email not confirmed/i.test(msg)) {
        setError('Confirme su correo en el enlace enviado por Supabase antes de entrar.')
      } else {
        setError(msg || 'No se pudo iniciar sesión.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-login-shell home-page-shell">
      <div className="home-page-bg" aria-hidden />
      <div className="auth-login-inner home-page-inner">
      <div className="auth-login-card">
        <LoginAvatar />
        <h1 className="auth-login-title">{config.loginTitulo}</h1>
        <p className="auth-login-sub">{config.loginSubtitulo}</p>
        <form className="auth-login-form" onSubmit={handleSubmit}>
          <label className="auth-login-field">
            <span>{config.loginLabelCorreo}</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={config.loginPlaceholderCorreo}
              disabled={loading}
              required
            />
          </label>
          <label className="auth-login-field">
            <span>{config.loginLabelPassword}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={config.loginPlaceholderPassword}
              disabled={loading}
              required
            />
          </label>
          {error ? (
            <p className="auth-login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="auth-login-submit" disabled={loading}>
            {loading ? 'Entrando…' : config.loginBoton}
          </button>
        </form>
        <p className="auth-login-hint muted small">{config.loginHint}</p>
      </div>
      </div>
    </div>
  )
}

/**
 * Exige sesión Supabase cuando hay URL/key configurados.
 * Sin Supabase (modo local) deja pasar sin login.
 */
export function AuthProvider({ children }) {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(() => !supabase)

  useEffect(() => {
    if (!supabase) return undefined
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) console.warn('Auth getSession:', error.message)
      setSession(data.session ?? null)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }, [supabase])

  const value = useMemo(
    () => ({
      supabase,
      session,
      user: session?.user ?? null,
      signOut,
      requiresAuth: Boolean(supabase),
    }),
    [supabase, session, signOut],
  )

  if (!authReady) {
    return (
      <div className="auth-login-shell home-page-shell">
        <div className="home-page-bg" aria-hidden />
        <div className="auth-login-inner home-page-inner">
          <p className="auth-login-loading muted">Verificando sesión…</p>
        </div>
      </div>
    )
  }

  if (supabase && !session) {
    return <LoginScreen supabase={supabase} onSignedIn={setSession} />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
