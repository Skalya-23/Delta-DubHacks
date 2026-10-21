import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useAuth } from '@/hooks/useAuth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Login, Signup } from '@/pages/Auth'
import { Dashboard } from '@/pages/Dashboard'
import { Feed } from '@/pages/Feed'
import { Join } from '@/pages/Join'
import { NewProject } from '@/pages/NewProject'
import { NotFound } from '@/pages/NotFound'
import { Page, ProjectLayout } from '@/pages/ProjectLayout'
import { Shared } from '@/pages/Shared'
import { Timeline } from '@/pages/Timeline'

const Ask = lazy(() => import('@/pages/Ask').then((m) => ({ default: m.Ask })))
const Checkpoints = lazy(() => import('@/pages/Checkpoints').then((m) => ({ default: m.Checkpoints })))
const ChangeDetail = lazy(() => import('@/pages/CommitDetail').then((m) => ({ default: m.ChangeDetail })))
const Compare = lazy(() => import('@/pages/Compare').then((m) => ({ default: m.Compare })))
const Notes = lazy(() => import('@/pages/Docs').then((m) => ({ default: m.Notes })))
const GoBack = lazy(() => import('@/pages/Restore').then((m) => ({ default: m.GoBack })))
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))

function Protected() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )
  }
  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }
  return (
    <AppShell>
      <Suspense
        fallback={
          <Page>
            <PageSkeleton />
          </Page>
        }
      >
        <Outlet />
      </Suspense>
    </AppShell>
  )
}

/** Old URLs (from before the redesign) keep working. */
function Redirect({ to }: { to: (p: Record<string, string | undefined>) => string }) {
  const params = useParams()
  return <Navigate to={to(params)} replace />
}

function NotConfigured() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-3xl">Almost there: connect Supabase</h1>
      <p className="mt-3 text-muted-foreground">
        Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code>, fill in{' '}
        <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart{' '}
        <code className="font-mono">npm run dev</code>.
      </p>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <NotConfigured />
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="/new" element={<NewProject />} />
        <Route path="/shared" element={<Shared />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="/:owner/:slug" element={<ProjectLayout />}>
          <Route index element={<Timeline />} />
          <Route path="change/:changeId" element={<ChangeDetail />} />
          <Route path="compare" element={<Compare />} />
          <Route path="go-back/:changeId" element={<GoBack />} />
          <Route path="checkpoints" element={<Checkpoints />} />
          <Route path="ask" element={<Ask />} />
          <Route path="notes" element={<Notes />} />
          <Route path="settings" element={<Settings />} />
          {/* pre-redesign URLs */}
          <Route path="commits" element={<Redirect to={(p) => `/${p.owner}/${p.slug}`} />} />
          <Route path="commit/:id" element={<Redirect to={(p) => `/${p.owner}/${p.slug}/change/${p.id}`} />} />
          <Route path="restore/:id" element={<Redirect to={(p) => `/${p.owner}/${p.slug}/go-back/${p.id}`} />} />
          <Route path="docs" element={<Redirect to={(p) => `/${p.owner}/${p.slug}/notes`} />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="*"
          element={
            <Page>
              <NotFound />
            </Page>
          }
        />
      </Route>
    </Routes>
  )
}
