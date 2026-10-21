import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

/** Turn Supabase auth errors into something a human wants to read. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Try again.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first, then sign in.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with that email already exists. Try signing in.'
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'That doesn’t look like a valid email address.'
  if (m.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.'
  if (m.includes('failed to fetch')) return 'Could not reach Supabase. Check your connection and .env.local settings.'
  if (m.includes('database error')) return "Could not create your profile. The database isn't set up yet (run supabase/schema.sql)."
  return message
}
