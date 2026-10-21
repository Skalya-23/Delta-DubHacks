import { Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ProjectGrid } from '@/components/ProjectGrid'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useAllMembers, useAllMyCommits, useMyProjects } from '@/hooks/useProject'
import { Page } from './ProjectLayout'

export function Shared() {
  const { user } = useAuth()
  const projects = useMyProjects()
  const commits = useAllMyCommits()
  const members = useAllMembers()
  const all = projects.data ?? []
  const sharedWithMe = all.filter((p) => p.owner_id !== user?.id)
  // Your own projects that have at least one teammate.
  const iShare = all.filter((p) => p.owner_id === user?.id && (members.data?.[p.id]?.length ?? 0) > 1)

  return (
    <Page>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight">Shared with you</h1>
          <p className="mt-1.5 max-w-xl text-muted-foreground">Projects you work on with other people. Everyone on a project can see every change, mark what works and comment.</p>
        </div>
        <Button variant="primary" size="lg" asChild>
          <Link to="/new?shared=1">
            <Users /> Create new shared project
          </Link>
        </Button>
      </div>

      {projects.isLoading ? (
        <ProjectGrid projects={[]} commits={[]} loading />
      ) : sharedWithMe.length === 0 && iShare.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing shared yet"
          action={
            <Button variant="primary" asChild>
              <Link to="/new?shared=1">
                <Users /> Create new shared project
              </Link>
            </Button>
          }
        >
          When a teammate invites you to their project, it'll show up here. Or start one yourself and invite your team.
        </EmptyState>
      ) : (
        <div className="space-y-12">
          <section aria-labelledby="with-me">
            <h2 id="with-me" className="mb-1 text-2xl">
              Invited by others
            </h2>
            <p className="mb-5 text-muted-foreground">Projects your teammates invited you to.</p>
            {sharedWithMe.length === 0 ? (
              <p className="rounded-2xl bg-subtle px-5 py-4 text-muted-foreground">Nobody has invited you to a project yet. Ask a teammate for an invite link.</p>
            ) : (
              <ProjectGrid projects={sharedWithMe} commits={commits.data ?? []} showOwner />
            )}
          </section>
          {iShare.length > 0 && (
            <section aria-labelledby="i-share">
              <h2 id="i-share" className="mb-1 text-2xl">
                Projects you share
              </h2>
              <p className="mb-5 text-muted-foreground">Your projects that have teammates.</p>
              <ProjectGrid projects={iShare} commits={commits.data ?? []} />
            </section>
          )}
        </div>
      )}
    </Page>
  )
}
