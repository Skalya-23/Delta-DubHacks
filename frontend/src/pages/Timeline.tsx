import { isToday, isYesterday, format } from 'date-fns'
import { ArrowRight, Clock, EyeOff, GitCompareArrows, Loader2, RotateCcw, Search, UserPlus, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ActivityHeatmap } from '@/components/ActivityHeatmap'
import { EmptyState } from '@/components/EmptyState'
import { FrameImage } from '@/components/FrameImage'
import { InviteDialog } from '@/components/InviteDialog'
import { LiveCameraDialog } from '@/components/LiveCameraDialog'
import { ListSkeleton } from '@/components/PageSkeleton'
import { SessionSummaries } from '@/components/SessionSummaries'
import { AnalyzingLine, ChangeChips, CheckpointFlag, FailedPill } from '@/components/Pills'
import { STATUS_META, StatusPill } from '@/components/StatusBadge'
import { TeamAvatars } from '@/components/TeamAvatars'
import { UserAvatar } from '@/components/UserAvatar'
import { WhoBuilding } from '@/components/WhoBuilding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useFilteredCommits, useProjectCommits, useProjectKeyFrames, type CommitFilters } from '@/hooks/useCommits'
import { useProfiles } from '@/hooks/useProfiles'
import { useMembers } from '@/hooks/useProject'
import { useCheckpointTags } from '@/hooks/useProjectData'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { commitTitle, exactTime, timeAgo } from '@/lib/format'
import type { Checkpoint, Commit, Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

function dayHeader(d: Date) {
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEEE, MMM d' : 'MMM d, yyyy')
}

export function changeTitle(c: Commit) {
  return c.processing_state === 'pending' && !c.title ? 'New change' : commitTitle(c)
}

const FILTERS: { value: CommitFilters['status']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'working', label: 'Works' },
  { value: 'broken', label: 'Broken' },
  { value: 'untested', label: 'Not tested' },
]

export function Timeline() {
  const { project, base, freshIds } = useProjectCtx()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? 'all') as CommitFilters['status']
  const showHidden = params.get('hidden') === '1'
  // Arriving from "Create new shared project" (?invite=1) opens the invite window.
  const [inviteOpen, setInviteOpen] = useState(() => params.get('invite') === '1')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(search)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 250)
    return () => window.clearTimeout(t)
  }, [search])

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  const all = useProjectCommits(project.id)
  const list = useFilteredCommits(project.id, { status, showHidden, search: debounced })
  const keyFrames = useProjectKeyFrames(project.id)
  const profiles = useProfiles()
  const members = useMembers(project.id)
  const tags = useCheckpointTags(project.id)

  const visible = (all.data ?? []).filter((c) => !c.is_hidden)
  const latest = visible[0]
  const lastWorks = visible.find((c) => c.status === 'working')
  const showBanner = latest && lastWorks && latest.status !== 'working' && lastWorks.id !== latest.id

  const paths = [
    ...(list.data ?? []).flatMap((c) => [keyFrames.data?.[c.id]?.before, keyFrames.data?.[c.id]?.after]),
    latest && keyFrames.data?.[latest.id]?.after,
    lastWorks && keyFrames.data?.[lastWorks.id]?.after,
  ]
  const urls = useSignedUrls(paths)
  const url = (commitId: string | undefined, kind: 'before' | 'after') => {
    const p = commitId ? keyFrames.data?.[commitId]?.[kind] : undefined
    return p ? urls.data?.[p] : undefined
  }

  const groups: { day: string; items: Commit[] }[] = []
  for (const c of list.data ?? []) {
    const day = dayHeader(new Date(c.captured_at))
    const g = groups[groups.length - 1]
    if (g?.day === day) g.items.push(c)
    else groups.push({ day, items: [c] })
  }
  const filtered = status !== 'all' || showHidden || debounced.trim() !== ''

  return (
    <div className="space-y-8">
      {/* 1. Right now */}
      <section className="card rise grid overflow-hidden md:grid-cols-[1.35fr_1fr]" aria-label="Right now">
        <div className="relative bg-subtle">
          {all.isLoading ? (
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
          ) : latest ? (
            <Link to={`${base}/change/${latest.id}`} aria-label={`Open the latest change, #${latest.seq}`}>
              <FrameImage url={url(latest.id, 'after')} loading={!urls.data} alt="Latest photo of the bench" />
            </Link>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center p-6 text-center text-muted-foreground">No photos yet. They'll show up here.</div>
          )}
          <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">Right now</span>
        </div>
        <div className="flex flex-col gap-5 p-6 md:p-8">
          <div>
            <h1 className="text-[30px] leading-tight">{project.name}</h1>
            {project.description && <p className="mt-1.5 text-muted-foreground">{project.description}</p>}
          </div>
          {latest && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={latest.status} />
                {latest.processing_state === 'pending' && <AnalyzingLine className="text-xs" />}
              </div>
              <Link to={`${base}/change/${latest.id}`} className="block text-sm text-muted-foreground hover:text-foreground">
                Latest: <span className="font-mono font-semibold text-foreground">Change #{latest.seq}</span> · {timeAgo(latest.captured_at)}
              </Link>
            </div>
          )}
          <WhoBuilding project={project} className="self-start" />
          <div className="flex flex-wrap items-center gap-3">
            <TeamAvatars people={(members.data ?? []).map((m) => profiles.data?.[m.user_id])} />
            <InviteDialog
              project={project}
              open={inviteOpen}
              onOpenChange={(o) => {
                setInviteOpen(o)
                if (!o && params.get('invite')) setParam('invite', null)
              }}
              trigger={
                <Button variant="ghost" size="sm" className="text-brand-text hover:bg-brand-soft hover:text-brand-text">
                  <UserPlus /> Invite people
                </Button>
              }
            />
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <LiveCameraDialog
              project={project}
              base={base}
              trigger={
                <Button variant="primary" size="lg">
                  <Video /> Live camera
                </Button>
              }
            />
            <Button variant="outline" size="lg" asChild>
              <Link to={`${base}/compare`}>
                <GitCompareArrows /> Compare two moments
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 1b. AI recaps of recent recording sessions */}
      <SessionSummaries projectId={project.id} />

      {/* 2. Last time it worked */}
      {showBanner && (
        <section className="rise flex flex-wrap items-center gap-4 rounded-2xl border-2 border-brand/40 bg-brand-soft p-4 pr-5" aria-label="Last time it worked">
          <div className="w-28 shrink-0 overflow-hidden rounded-xl">
            <FrameImage url={url(lastWorks.id, 'after')} loading={!urls.data} alt={`The bench at change #${lastWorks.seq}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-brand-text">
              The latest change is {STATUS_META[latest.status].label.toLowerCase()}.
            </p>
            <p className="font-heading text-xl font-semibold">
              Last time it worked: Change #{lastWorks.seq}, {timeAgo(lastWorks.captured_at)}
            </p>
            <p className="truncate text-sm text-muted-foreground">{commitTitle(lastWorks)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild>
              <Link to={`${base}/compare?base=${lastWorks.id}&head=${latest.id}`}>See what's different</Link>
            </Button>
            <Button variant="primary" size="lg" asChild>
              <Link to={`${base}/go-back/${lastWorks.id}`}>
                <RotateCcw /> Go back to this
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* 3. Filters */}
      <section aria-label="Timeline" className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-2 text-2xl">Timeline</h2>
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setParam('q', e.target.value || null)
              }}
              placeholder="Search changes…"
              className="pl-10"
              aria-label="Search changes"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show changes that">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={status === f.value}
                onClick={() => setParam('status', f.value === 'all' ? null : f.value)}
                className={cn(
                  'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
                  status === f.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showHidden} onCheckedChange={(v) => setParam('hidden', v ? '1' : null)} aria-label="Show hidden changes" />
            Show hidden
          </label>
        </div>

        {/* 4. The rail */}
        {list.isLoading ? (
          <ListSkeleton rows={4} />
        ) : (all.data?.length ?? 0) === 0 ? (
          <EmptyState icon={Clock} title="Nothing has changed yet">
            Move something on your bench and it'll show up here. Haven't connected a camera?{' '}
            <Link to={`${base}/settings`} className="font-medium text-brand-text underline underline-offset-2">
              Here's how
            </Link>
            .
          </EmptyState>
        ) : groups.length === 0 ? (
          <EmptyState icon={Search} title="No changes match">
            {filtered ? 'Try another word, or switch back to All.' : 'Every change is hidden. Turn on "Show hidden" to see them.'}
          </EmptyState>
        ) : (
          <div className="relative">
            <div className="absolute top-2 bottom-2 left-[15px] w-0.5 rounded-full bg-border" aria-hidden />
            <div className="space-y-8">
              {groups.map((g) => (
                <div key={g.day}>
                  <h3 className="relative mb-3 flex items-center gap-3 text-sm font-semibold text-muted-foreground">
                    <span className="relative z-10 flex size-8 items-center justify-center rounded-full border border-border bg-background">
                      <Clock className="size-4" aria-hidden />
                    </span>
                    {g.day}
                  </h3>
                  <ol className="space-y-3">
                    {g.items.map((c) => (
                      <TimelineItem
                        key={c.id}
                        commit={c}
                        base={base}
                        beforeUrl={url(c.id, 'before')}
                        afterUrl={url(c.id, 'after')}
                        loading={keyFrames.isLoading || urls.isLoading}
                        author={c.author_id ? profiles.data?.[c.author_id] : undefined}
                        flags={tags[c.id]}
                        fresh={freshIds.has(c.id)}
                      />
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 5. Activity */}
      {(all.data?.length ?? 0) > 0 && (
        <ActivityHeatmap commits={all.data ?? []} title="Activity" summary={(n, period) => `${n} change${n === 1 ? '' : 's'} ${period}`} />
      )}
    </div>
  )
}

function TimelineItem({
  commit: c,
  base,
  beforeUrl,
  afterUrl,
  loading,
  author,
  flags,
  fresh,
}: {
  commit: Commit
  base: string
  beforeUrl?: string
  afterUrl?: string
  loading: boolean
  author?: Profile
  flags?: Checkpoint[]
  fresh?: boolean
}) {
  const m = STATUS_META[c.status]
  return (
    <li className={cn(fresh && 'slide-in')}>
      {flags?.map((f) => (
        <div key={f.id} className="relative mb-2 flex items-center gap-3">
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center" aria-hidden>
            <span className="size-3 rotate-45 rounded-[3px] bg-brand" />
          </span>
          <CheckpointFlag checkpoint={f} to={`${base}/checkpoints`} />
          <span className="text-xs text-muted-foreground">checkpoint saved here</span>
        </div>
      ))}
      <div className="flex gap-3">
        <span className="relative z-10 flex w-8 shrink-0 justify-center pt-7" aria-hidden>
          <span className={cn('size-3.5 rounded-full ring-4 ring-background', m.dot)} />
        </span>
        <Link
          to={`${base}/change/${c.id}`}
          className={cn(
            'card group flex min-w-0 flex-1 flex-col gap-4 p-3.5 transition-all hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center',
            c.is_hidden && 'opacity-60',
            fresh && 'glow',
          )}
        >
          <div className="flex shrink-0 items-center gap-1.5">
            {[beforeUrl, afterUrl].map((url, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i === 1 && <ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
                <div className="w-28 overflow-hidden rounded-lg">
                  {!url && c.processing_state === 'pending' ? (
                    // Photos not loaded yet for a brand-new change: show it's being processed.
                    <div className="shimmer aspect-[4/3] w-full" aria-label="Processing" />
                  ) : (
                    <FrameImage url={url} loading={loading && !url} alt={i === 0 ? 'Before' : 'After'} />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-heading text-[17px] leading-snug font-semibold group-hover:text-brand-text">
                <span className="mr-1.5 font-mono text-sm font-medium text-muted-foreground">#{c.seq}</span>
                {changeTitle(c)}
              </h4>
              {c.processing_state === 'pending' ? (
                <span className="mt-0.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-ai-soft px-2.5 text-xs font-semibold text-ai">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Processing
                </span>
              ) : (
                <StatusPill status={c.status} size="sm" className="mt-0.5" />
              )}
            </div>
            {c.processing_state === 'pending' ? (
              <AnalyzingLine />
            ) : c.processing_state === 'failed' ? (
              <div className="space-y-1">
                <FailedPill />
                {c.mk1_summary && <p className="line-clamp-2 text-sm text-muted-foreground">{c.mk1_summary}</p>}
              </div>
            ) : (
              <>
                {c.mk1_summary && <p className="line-clamp-2 text-sm text-ai">{c.mk1_summary}</p>}
                <ChangeChips changes={c.changes} />
              </>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserAvatar profile={author} size={18} />
              <span>{author?.username ?? 'someone'}</span>
              <span>·</span>
              <time dateTime={c.captured_at} title={exactTime(c.captured_at)}>
                {timeAgo(c.captured_at)}
              </time>
              {c.is_hidden && (
                <span className="inline-flex items-center gap-1">
                  · <EyeOff className="size-3" aria-hidden /> Not a real change
                </span>
              )}
            </div>
          </div>
        </Link>
      </div>
    </li>
  )
}
