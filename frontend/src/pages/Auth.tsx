import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BenchIllustration } from '@/components/BenchIllustration'
import { DeltaLogo } from '@/components/DeltaLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyAuthError, useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-soft p-12 lg:flex" aria-label="About Delta">
        <DeltaLogo size="lg" />
        <div className="rise max-w-lg">
          <h2 className="text-[40px] leading-[1.1]">Version control for the physical world.</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Delta watches your workbench and saves every change, so you can see what changed and go back to when it worked.
          </p>
          <BenchIllustration className="mt-10 w-full max-w-md text-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Made for robotics teams, labs and makers.</p>
      </section>

      <section className="flex flex-col items-center justify-center px-6 py-12">
        <div className="mb-10 lg:hidden">
          <DeltaLogo size="md" />
        </div>
        <div className="rise w-full max-w-sm">
          <h1 className="text-3xl">{title}</h1>
          <p className="mt-2 mb-8 text-muted-foreground">{subtitle}</p>
          {children}
          <p className="mt-8 text-center text-muted-foreground">{footer}</p>
        </div>
      </section>
    </div>
  )
}

/** Where to go after signing in (e.g. back to an invite link). Only same-site paths are allowed. */
function useNext() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const safe = next && /^\/(?![/\\])/.test(next) ? next : '/'
  return { next: safe, query: safe === '/' ? '' : `?next=${encodeURIComponent(safe)}` }
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-5 rounded-xl bg-broken-soft px-4 py-3 text-sm text-broken">
      {message}
    </div>
  )
}

export function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { next, query } = useNext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={next} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) return setError(friendlyAuthError(error.message))
    navigate(next, { replace: true })
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={next.startsWith('/join/') ? 'Sign in to accept your invite.' : "Sign in to see what's been happening on your bench."}
      footer={
        <>
          New here?{' '}
          <Link to={`/signup${query}`} className="font-semibold text-brand-text hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {error && <ErrorBox message={error} />}
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}

export function Signup() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { next, query } = useNext()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={next} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9_-]{1,38}$/.test(u)) {
      return setError('Pick a username with 2–39 lowercase letters, numbers, dashes or underscores.')
    }
    if (password.length < 6) return setError('Your password needs at least 6 characters.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: u, display_name: u } },
    })
    setBusy(false)
    if (error) return setError(friendlyAuthError(error.message))
    if (!data.session) {
      setInfo('Check your email to confirm your account, then sign in.')
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={next.startsWith('/join/') ? 'Sign up to accept your invite. It takes 30 seconds.' : 'It takes 30 seconds. Then create a project and connect your camera.'}
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${query}`} className="font-semibold text-brand-text hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {error && <ErrorBox message={error} />}
      {info && (
        <div role="status" className="mb-5 rounded-xl bg-works-soft px-4 py-3 text-sm text-works">
          {info}
        </div>
      )}
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="ada" />
          <p className="text-xs text-muted-foreground">This is how your team will see you.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="text-xs text-muted-foreground">At least 6 characters.</p>
        </div>
        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  )
}
