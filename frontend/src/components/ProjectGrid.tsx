import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAfterFramesFor } from '@/hooks/useCommits'
import { useProfiles } from '@/hooks/useProfiles'
import { useAllMembers, type CommitLite } from '@/hooks/useProject'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { timeAgo } from '@/lib/format'
import type { Project } from '@/lib/types'
import { DeltaIcon } from './DeltaLogo'
import { FrameImage } from './FrameImage'
import { StatusPill } from './StatusBadge'
import { TeamAvatars } from './TeamAvatars'

const WEEK = 7 * 24 * 3600 * 1000

/** Visual project cards: latest bench photo on top, then name, status, activity and team. */
export function ProjectGrid({
  projects,
  commits,
  loading,
  showOwner,
}: {
  projects: Project[]
  commits: CommitLite[]
  loading?: boolean
  /** Show "by <owner>" (for projects shared with you). */
  showOwner?: boolean
}) {
  const profiles = useProfiles()
  const members = useAllMembers()
  const [weekAgo] = useState(() => Date.now() - WEEK)

  const byProject: Record<string, CommitLite[]> = {}
  for (const c of commits) if (!c.is_hidden) (byProject[c.project_id] ??= []).push(c)
  const latestIds = projects.map((p) => byProject[p.id]?.[0]?.id).filter((x): x is string => Boolean(x))
  const frames = useAfterFramesFor(latestIds)
  const urls = useSignedUrls(Object.values(frames.data ?? {}))

  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    )
  }

  const list = projects
    .map((p) => {
      const cs = byProject[p.id] ?? []
      return { p, last: cs[0], thisWeek: cs.filter((c) => new Date(c.captured_at).getTime() > weekAgo).length, activity: cs[0]?.captured_at ?? p.created_at }
    })
    .sort((a, b) => b.activity.localeCompare(a.activity))

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {list.map(({ p, last, thisWeek, activity }, i) => {
        const owner = profiles.data?.[p.owner_id]
        const path = last ? frames.data?.[last.id] : undefined
        const team = (members.data?.[p.id] ?? []).map((m) => profiles.data?.[m.user_id])
        return (
          <li key={p.id} className="rise" style={{ animationDelay: `${i * 50}ms` }}>
            <Link
              to={`/${owner?.username ?? '…'}/${p.slug}`}
              className="card group block overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-subtle">
                {path ? (
                  <FrameImage
                    url={urls.data?.[path]}
                    loading={!urls.data}
                    alt={`Latest photo of ${p.name}`}
                    className="h-full"
                    imgClassName="h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <DeltaIcon size={40} />
                    <span className="text-sm">No photos yet</span>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg">{p.name}</h3>
                    {showOwner && owner && <p className="text-sm text-muted-foreground">by {owner.username}</p>}
                  </div>
                  {last && <StatusPill status={last.status} size="sm" />}
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {last ? (
                      <>
                        {thisWeek} change{thisWeek === 1 ? '' : 's'} this week · last change {timeAgo(activity)}
                      </>
                    ) : (
                      'Waiting for the first change'
                    )}
                  </p>
                  {team.length > 1 && <TeamAvatars people={team} size={24} className="shrink-0" />}
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
