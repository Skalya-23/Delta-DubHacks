import { ArrowLeft, Eye, EyeOff, Flag, GitCompareArrows, Info, ListChecks, MoreHorizontal, NotebookPen, Pencil, RotateCcw, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChangeList } from '@/components/ChangeList'
import { CreateCheckpointDialog } from '@/components/CreateCheckpointDialog'
import { EmptyState } from '@/components/EmptyState'
import { FrameStrip } from '@/components/FrameStrip'
import { Markdown } from '@/components/Markdown'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { AiCard, AnalyzingShimmer } from '@/components/Mk1Card'
import { TeamComments } from '@/components/NotesThread'
import { PageSkeleton } from '@/components/PageSkeleton'
import { CheckpointFlag } from '@/components/Pills'
import { StatusPicker } from '@/components/StatusBadge'
import { UserAvatar } from '@/components/UserAvatar'
import { VisualDiff } from '@/components/VisualDiff'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCommit, useFrames, useProjectCommits, useUpdateCommit } from '@/hooks/useCommits'
import { useProfiles } from '@/hooks/useProfiles'
import { useCheckpointTags } from '@/hooks/useProjectData'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { commitTitle, exactTime, timeAgo } from '@/lib/format'
import type { Commit, CommitStatus } from '@/lib/types'
import { changeTitle } from './Timeline'

const STATUS_TOAST: Record<CommitStatus, string> = {
  working: 'Marked as Works 🎉',
  broken: 'Marked as Broken',
  untested: 'Marked as Not tested',
}

export function ChangeDetail() {
  const { changeId } = useParams()
  const { project, base } = useProjectCtx()
  const navigate = useNavigate()
  const commit = useCommit(changeId)
  const all = useProjectCommits(project.id)
  const frames = useFrames(changeId)
  const urls = useSignedUrls((frames.data ?? []).map((f) => f.storage_path))
  const profiles = useProfiles()
  const tags = useCheckpointTags(project.id)
  const update = useUpdateCommit()
  const [hovered, setHovered] = useState<number | null>(null)
  const [checkpointOpen, setCheckpointOpen] = useState(false)

  if (commit.isLoading) return <PageSkeleton />
  const c = commit.data
  if (!c || c.project_id !== project.id) {
    return (
      <EmptyState icon={SearchX} title="We couldn't find this change">
        It may have been deleted.{' '}
        <Link to={base} className="font-medium text-brand-text underline underline-offset-2">
          Back to the timeline
        </Link>
      </EmptyState>
    )
  }

  const save = (patch: Partial<Commit>, msg?: string) =>
    update.mutate(
      { id: c.id, patch },
      { onSuccess: () => msg && toast.success(msg), onError: (e) => toast.error(`Couldn't save: ${e.message}`) },
    )

  const author = c.author_id ? profiles.data?.[c.author_id] : undefined
  const before = frames.data?.find((f) => f.kind === 'before')
  const after = frames.data?.find((f) => f.kind === 'after')
  const urlMap = urls.data ?? {}

  // Neighbours on the timeline (skip hidden changes unless this one is hidden too).
  const timeline = (all.data ?? []).filter((x) => !x.is_hidden || x.id === c.id)
  const idx = timeline.findIndex((x) => x.id === c.id)
  const newer = idx > 0 ? timeline[idx - 1] : undefined
  const older = idx >= 0 && idx < timeline.length - 1 ? timeline[idx + 1] : undefined
  const lastWorks = (all.data ?? []).find((x) => x.status === 'working' && !x.is_hidden && x.id !== c.id)

  return (
    <div className="space-y-6">
      <Link to={base} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Timeline
      </Link>

      {/* 1 + 5. Header and actions */}
      <header className="rise flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="font-mono text-sm font-semibold text-brand-text">Change #{c.seq}</div>
          <TitleEditor commit={c} onSave={(title) => save({ title }, 'Title saved')} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <UserAvatar profile={author} size={24} />
            <span className="font-medium text-foreground">{author?.username ?? 'Someone'}</span>
            <span>·</span>
            <time dateTime={c.captured_at} title={exactTime(c.captured_at)}>
              {timeAgo(c.captured_at)}
            </time>
            {tags[c.id]?.map((t) => <CheckpointFlag key={t.id} checkpoint={t} to={`${base}/checkpoints`} className="ml-1" />)}
            {c.is_hidden && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-0.5 text-xs">
                <EyeOff className="size-3" aria-hidden /> Hidden: not a real change
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" asChild>
            <Link to={`${base}/go-back/${c.id}`}>
              <RotateCcw /> Go back to this
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setCheckpointOpen(true)}>
            <Flag /> Save as checkpoint
          </Button>
          <Button variant="outline" onClick={() => navigate(`${base}/compare?${lastWorks ? `base=${lastWorks.id}&` : ''}head=${c.id}`)}>
            <GitCompareArrows /> Compare with…
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => save({ is_hidden: !c.is_hidden }, c.is_hidden ? 'Back on the timeline' : 'Hidden from the timeline')}>
                {c.is_hidden ? <Eye /> : <EyeOff />}
                {c.is_hidden ? 'Show it again (it is a real change)' : 'Not a real change (hide it)'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-muted-foreground">Does it work?</span>
        <StatusPicker status={c.status} onChange={(status) => save({ status }, STATUS_TOAST[status])} disabled={update.isPending} />
      </div>

      {/* 2 + 6. Viewer with prev/next */}
      <VisualDiff
        beforeUrl={before ? urlMap[before.storage_path] : undefined}
        afterUrl={after ? urlMap[after.storage_path] : undefined}
        loading={frames.isLoading || urls.isLoading}
        changes={c.processing_state === 'pending' ? [] : c.changes}
        objectsBefore={c.objects_before}
        objectsAfter={c.objects_after}
        highlighted={hovered}
        onHover={setHovered}
        prev={older ? { to: `${base}/change/${older.id}`, label: `Older: Change #${older.seq}` } : undefined}
        next={newer ? { to: `${base}/change/${newer.id}`, label: `Newer: Change #${newer.seq}` } : undefined}
      />

      {/* 3. Flipbook */}
      <section className="card p-5" aria-labelledby="flipbook-heading">
        <h2 id="flipbook-heading" className="mb-3 text-lg">
          Flipbook
        </h2>
        <FrameStrip frames={frames.data ?? []} urls={urlMap} loading={frames.isLoading} />
      </section>

      {/* 4. Two columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="what-heading">
            <h2 id="what-heading" className="mb-1 flex items-center gap-2 text-lg">
              <ListChecks className="size-5 text-muted-foreground" aria-hidden /> What changed
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">Point at a line to highlight it in the photos.</p>
            {c.processing_state === 'pending' ? (
              <AnalyzingShimmer lines={3} />
            ) : (
              <ChangeList changes={c.changes} highlighted={hovered} onHover={setHovered} emptyText="Nothing on the bench moved." />
            )}
          </section>
          <AiCard commit={c} />
        </div>
        <div className="space-y-6">
          <YourNotes commit={c} onSave={(user_description) => save({ user_description }, 'Notes saved')} saving={update.isPending} />
          <TeamComments commitId={c.id} projectId={project.id} />
        </div>
      </div>

      <details className="card group p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground">
          <Info className="size-4" aria-hidden /> Details (for debugging)
        </summary>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
          <dt className="text-muted-foreground">Full ID</dt>
          <dd className="font-mono break-all">{c.id}</dd>
          <dt className="text-muted-foreground">Captured</dt>
          <dd>{exactTime(c.captured_at)}</dd>
          <dt className="text-muted-foreground">AI status</dt>
          <dd>{{ pending: 'Still looking', described: 'Done', failed: 'Failed' }[c.processing_state]}</dd>
          <dt className="text-muted-foreground">Parts seen after</dt>
          <dd>{c.objects_after.map((o) => o.name).join(', ') || '–'}</dd>
        </dl>
      </details>

      <CreateCheckpointDialog projectId={project.id} commits={all.data ?? []} defaultCommitId={c.id} open={checkpointOpen} onOpenChange={setCheckpointOpen} />
    </div>
  )
}

function TitleEditor({ commit, onSave }: { commit: Commit; onSave: (t: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  if (editing) {
    return (
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(value.trim() || null)
          setEditing(false)
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="h-12 min-w-64 flex-1 text-xl" aria-label="Title" placeholder={commitTitle({ ...commit, title: null })} />
        <Button type="submit" variant="primary" size="lg">
          Save
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    )
  }
  return (
    <h1 className="text-[30px] leading-tight">
      <button
        type="button"
        className="group inline text-left hover:text-brand-text"
        onClick={() => {
          setValue(commit.title ?? '')
          setEditing(true)
        }}
        title="Click to rename"
      >
        {changeTitle(commit)}
        <Pencil className="ml-2 inline size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-label="Edit title" />
      </button>
    </h1>
  )
}

/** "Your notes": a plain text box with Save; once saved, it's shown nicely with an Edit button. */
function YourNotes({ commit, onSave, saving }: { commit: Commit; onSave: (v: string) => void; saving: boolean }) {
  const body = commit.user_description ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <section className="card p-5" aria-labelledby="notes-heading">
      <div className="mb-1 flex items-center gap-2">
        <h2 id="notes-heading" className="flex items-center gap-2 text-lg">
          <NotebookPen className="size-5 text-muted-foreground" aria-hidden /> Your notes
        </h2>
        {body.trim() && !editing && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Why did you make this change? What did you test?</p>
      {editing ? (
        <MarkdownEditor
          initial={body}
          split={false}
          minRows={6}
          autoFocus
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            onSave(v)
            setEditing(false)
          }}
        />
      ) : body.trim() ? (
        <Markdown>{body}</Markdown>
      ) : (
        <div className="space-y-3">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="e.g. Moved the motor closer to shorten the wires. It stalls now, check the driver." aria-label="Your notes" />
          <div className="flex justify-end">
            <Button variant="primary" size="sm" disabled={!draft.trim() || saving} onClick={() => onSave(draft)}>
              Save
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
