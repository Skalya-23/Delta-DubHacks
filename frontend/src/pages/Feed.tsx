import { format, isToday, isYesterday } from 'date-fns'
import { Activity, Flag, MessageCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { FrameImage } from '@/components/FrameImage'
import { Markdown } from '@/components/Markdown'
import { ListSkeleton } from '@/components/PageSkeleton'
import { AnalyzingLine, ChangeChips } from '@/components/Pills'
import { StatusPill } from '@/components/StatusBadge'
import { UserAvatar } from '@/components/UserAvatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useAfterFramesFor } from '@/hooks/useCommits'
import { useFeed, useFeedRealtime, type FeedItem } from '@/hooks/useFeed'
import { useProfiles } from '@/hooks/useProfiles'
import { useMyProjects } from '@/hooks/useProject'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { commitTitle, exactTime, timeAgo } from '@/lib/format'
import type { Project } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Page } from './ProjectLayout'
import { changeTitle } from './Timeline'

type Kind = 'all' | FeedItem['kind']

const KINDS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'change', label: 'Changes' },
  { value: 'checkpoint', label: 'Checkpoints' },
  { value: 'comment', label: 'Comments' },
]

function dayHeader(d: Date) {
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEEE, MMM d' : 'MMM d, yyyy')
}

export function Feed() {
  const { user } = useAuth()
  const feed = useFeed()
  useFeedRealtime()
  const projects = useMyProjects()
  const profiles = useProfiles()
  const [kind, setKind] = useState<Kind>('all')
  const [projectId, setProjectId] = useState('all')

  const projectById = new Map((projects.data ?? []).map((p) => [p.id, p]))
  const items = (feed.data ?? []).filter((i) => (kind === 'all' || i.kind === kind) && (projectId === 'all' || i.projectId === projectId))
  const changeIds = items.filter((i) => i.kind === 'change').map((i) => (i.kind === 'change' ? i.commit.id : ''))
  const frames = useAfterFramesFor(changeIds)
  const urls = useSignedUrls(Object.values(frames.data ?? {}))

  const groups: { day: string; items: FeedItem[] }[] = []
  for (const it of items) {
    const day = dayHeader(new Date(it.at))
    const g = groups[groups.length - 1]
    if (g?.day === day) g.items.push(it)
    else groups.push({ day, items: [it] })
  }

  const projectHref = (p?: Project) => (p ? `/${profiles.data?.[p.owner_id]?.username ?? '…'}/${p.slug}` : '/')

  return (
    <Page>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[32px] leading-tight">Feed</h1>
        <p className="mt-1.5 text-muted-foreground">Everything happening across all your projects and teams, as it happens.</p>

        <div className="mt-6 mb-8 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
                  kind === k.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger size="sm" className="ml-auto w-52" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All projects</SelectItem>
              {(projects.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {feed.isLoading ? (
          <ListSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon={Activity} title={(feed.data?.length ?? 0) === 0 ? 'Your feed is quiet' : 'Nothing matches'}>
            {(feed.data?.length ?? 0) === 0
              ? 'When anything changes on one of your benches, or a teammate saves a checkpoint or comments, it shows up here.'
              : 'Try “Everything” or another project.'}
          </EmptyState>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.day} aria-label={g.day}>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{g.day}</h2>
                <ol className="space-y-3">
                  {g.items.map((it) => {
                    const project = projectById.get(it.projectId)
                    const base = projectHref(project)
                    const who = it.userId ? profiles.data?.[it.userId] : undefined
                    const name = it.userId === user?.id ? 'You' : (who?.username ?? 'The camera')
                    const projectLink = (
                      <Link to={base} className="font-semibold text-foreground hover:text-brand-text">
                        {project?.name ?? 'a project'}
                      </Link>
                    )
                    const header = (verb: React.ReactNode, Icon: typeof Flag, iconClass: string) => (
                      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <span className="relative shrink-0">
                          <UserAvatar profile={who} size={30} />
                          <span className={cn('absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card', iconClass)}>
                            <Icon className="size-2.5 text-white" strokeWidth={2.5} aria-hidden />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold text-foreground">{name}</span> {verb} {projectLink}
                        </span>
                        <time className="shrink-0 text-xs" dateTime={it.at} title={exactTime(it.at)}>
                          {timeAgo(it.at)}
                        </time>
                      </div>
                    )

                    if (it.kind === 'change') {
                      const c = it.commit
                      const path = frames.data?.[c.id]
                      return (
                        <li key={it.id} className="card rise p-4">
                          {header('saved a change in', Sparkles, 'bg-brand')}
                          <Link to={`${base}/change/${c.id}`} className="group mt-3 flex gap-4 rounded-xl p-1 transition-colors hover:bg-subtle">
                            <div className="w-36 shrink-0 overflow-hidden rounded-lg">
                              <FrameImage url={path ? urls.data?.[path] : undefined} loading={Boolean(path) && !urls.data} alt="" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-heading text-[17px] leading-snug group-hover:text-brand-text">
                                  <span className="mr-1.5 font-mono text-sm font-medium text-muted-foreground">#{c.seq}</span>
                                  {changeTitle(c)}
                                </h3>
                                <StatusPill status={c.status} size="sm" />
                              </div>
                              {c.processing_state === 'pending' ? (
                                <AnalyzingLine />
                              ) : (
                                <>
                                  {c.mk1_summary && <p className="line-clamp-2 text-sm text-ai">{c.mk1_summary}</p>}
                                  <ChangeChips changes={c.changes} />
                                </>
                              )}
                            </div>
                          </Link>
                        </li>
                      )
                    }
                    if (it.kind === 'checkpoint') {
                      return (
                        <li key={it.id} className="card rise p-4">
                          {header('saved a checkpoint in', Flag, 'bg-brand')}
                          <Link to={`${base}/checkpoints`} className="mt-3 flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 hover:brightness-[0.98]">
                            <Flag className="size-5 shrink-0 text-brand-text" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block font-heading text-[17px] font-semibold">{it.checkpoint.name}</span>
                              {it.commit && (
                                <span className="block truncate text-sm text-muted-foreground">
                                  at change #{it.commit.seq}: {commitTitle(it.commit)}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      )
                    }
                    return (
                      <li key={it.id} className="card rise p-4">
                        {header(
                          <>
                            commented on{' '}
                            {it.commit ? (
                              <Link to={`${base}/change/${it.commit.id}`} className="font-semibold text-foreground hover:text-brand-text">
                                change #{it.commit.seq}
                              </Link>
                            ) : (
                              'a change'
                            )}{' '}
                            in
                          </>,
                          MessageCircle,
                          'bg-[#0D9488]',
                        )}
                        <div className="mt-3 ml-10 rounded-2xl rounded-tl-md bg-subtle px-4 py-2.5">
                          <Markdown className="line-clamp-4 text-[15px]">{it.note.body}</Markdown>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
            {(feed.data?.length ?? 0) >= 60 && <p className="text-center text-sm text-muted-foreground">Showing the most recent activity.</p>}
          </div>
        )}
      </div>
    </Page>
  )
}
