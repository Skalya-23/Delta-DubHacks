import { Lock, WifiOff } from 'lucide-react'
import { Suspense } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageSkeleton } from '@/components/PageSkeleton'
import { RecordingButton } from '@/components/RecordingButton'
import { useAuth } from '@/hooks/useAuth'
import { useProjectBySlug } from '@/hooks/useProject'
import type { ProjectCtx } from '@/hooks/useProjectCtx'
import { useProjectLive } from '@/hooks/useProjectLive'

export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8 md:py-10">{children}</main>
}

export function ProjectLayout() {
  const { owner, slug } = useParams()
  const { user } = useAuth()
  const project = useProjectBySlug(owner, slug)
  const p = project.data
  const { freshIds, connected } = useProjectLive(p?.id)

  if (project.isLoading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )
  }
  if (!p) {
    return (
      <Page>
        <EmptyState icon={Lock} title="We couldn't find this project">
          {project.error ? project.error.message : "It may have been deleted, or you haven't been added to it yet. Ask the project owner to add you."}
        </EmptyState>
      </Page>
    )
  }

  const ctx: ProjectCtx = { project: p, base: `/${owner}/${slug}`, freshIds, isOwner: p.owner_id === user?.id }
  return (
    <Page>
      {/* On every project page: which project you're in, and the recording control. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 pt-2">
          <Link to={ctx.base} className="block truncate text-sm font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground">
            {p.name}
          </Link>
          {!connected && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-broken" role="status">
              <WifiOff className="size-3.5" aria-hidden /> Live updates disconnected. Reconnecting…
            </p>
          )}
        </div>
        <RecordingButton projectId={p.id} />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Outlet context={ctx} />
      </Suspense>
    </Page>
  )
}
