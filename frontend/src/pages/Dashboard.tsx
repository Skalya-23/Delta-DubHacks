import { Camera, FolderPlus, Hand, Plus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActivityHeatmap } from '@/components/ActivityHeatmap'
import { ProjectGrid } from '@/components/ProjectGrid'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMyProfile } from '@/hooks/useProfiles'
import { useAllMyCommits, useMyProjects } from '@/hooks/useProject'
import { Page } from './ProjectLayout'

export function Dashboard() {
  const { user } = useAuth()
  const me = useMyProfile()
  const projects = useMyProjects()
  const commits = useAllMyCommits()

  const mine = (projects.data ?? []).filter((p) => p.owner_id === user?.id)
  const shared = (projects.data ?? []).filter((p) => p.owner_id !== user?.id)
  const projectCount = projects.data?.length ?? 0

  return (
    <Page>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground">Hi{me ? `, ${me.display_name ?? me.username}` : ''} 👋</p>
          <h1 className="text-[32px] leading-tight">Your projects</h1>
        </div>
        <Button variant="primary" size="lg" asChild>
          <Link to="/new">
            <Plus /> New project
          </Link>
        </Button>
      </div>

      {projects.isLoading ? (
        <ProjectGrid projects={[]} commits={[]} loading />
      ) : mine.length === 0 ? (
        <GettingStarted />
      ) : (
        <ProjectGrid projects={mine} commits={commits.data ?? []} />
      )}

      {shared.length > 0 && (
        <section className="mt-12" aria-labelledby="shared-heading">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 id="shared-heading" className="flex items-center gap-2 text-2xl">
                <Users className="size-5 text-brand-text" aria-hidden /> Shared with you
              </h2>
              <p className="mt-1 text-muted-foreground">Projects your teammates invited you to.</p>
            </div>
            {shared.length > 3 && (
              <Link to="/shared" className="text-sm font-medium text-brand-text hover:underline">
                See all {shared.length}
              </Link>
            )}
          </div>
          <ProjectGrid projects={shared.slice(0, 3)} commits={commits.data ?? []} showOwner />
        </section>
      )}

      {projectCount > 0 && (
        <section className="mt-12" aria-label="Activity">
          {commits.isLoading ? (
            <Skeleton className="h-44 rounded-2xl" />
          ) : (
            <ActivityHeatmap
              commits={commits.data ?? []}
              summary={(n, period) => `${n} change${n === 1 ? '' : 's'} ${period} across ${projectCount} project${projectCount === 1 ? '' : 's'}`}
            />
          )}
        </section>
      )}
    </Page>
  )
}

function GettingStarted() {
  const steps = [
    { icon: FolderPlus, title: 'Create a project', text: 'One project per build: a robot, a lab setup, a bench.' },
    { icon: Camera, title: 'Connect your camera', text: 'Point the Jetson camera at your bench and paste in the project ID.' },
    { icon: Hand, title: 'Move something on your bench', text: 'Delta saves the change with photos and a description. That’s it.' },
  ]
  return (
    <div className="card rise p-8 md:p-10">
      <h2 className="text-2xl">Get started in 3 steps</h2>
      <p className="mt-1 text-muted-foreground">No setup wizardry. You'll see your first change in a couple of minutes.</p>
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-2xl bg-subtle p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand font-heading font-semibold text-white">{i + 1}</span>
              <s.icon className="size-5 text-brand-text" aria-hidden />
            </div>
            <h3 className="text-base">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
      <Button variant="primary" size="lg" className="mt-8" asChild>
        <Link to="/new">
          <Plus /> Create your first project
        </Link>
      </Button>
    </div>
  )
}
