import { ArrowLeft, ArrowRight, ArrowUpDown, GitCompareArrows, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChangeList } from '@/components/ChangeList'
import { MomentPicker } from '@/components/CommitPicker'
import { EmptyState } from '@/components/EmptyState'
import { PageSkeleton } from '@/components/PageSkeleton'
import { VisualDiff } from '@/components/VisualDiff'
import { Button } from '@/components/ui/button'
import { useProjectCommits, useProjectKeyFrames } from '@/hooks/useCommits'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { diffObjects } from '@/lib/diff'

export function Compare() {
  const { project, base } = useProjectCtx()
  const [params, setParams] = useSearchParams()
  const all = useProjectCommits(project.id)
  const keyFrames = useProjectKeyFrames(project.id)
  const [hovered, setHovered] = useState<number | null>(null)

  const commits = (all.data ?? []).filter((c) => !c.is_hidden && c.processing_state !== 'pending')
  const latest = commits[0]
  const lastWorks = commits.find((c) => c.status === 'working')
  // URL keeps the old names (base/head) so existing links keep working.
  const fromId = params.get('base') ?? lastWorks?.id ?? commits[1]?.id
  const toId = params.get('head') ?? latest?.id
  const from = (all.data ?? []).find((c) => c.id === fromId)
  const to = (all.data ?? []).find((c) => c.id === toId)

  const thumbPaths = commits.map((c) => keyFrames.data?.[c.id]?.after)
  const urls = useSignedUrls(thumbPaths)
  const thumbs: Record<string, string | undefined> = {}
  for (const c of commits) {
    const p = keyFrames.data?.[c.id]?.after
    thumbs[c.id] = p ? urls.data?.[p] : undefined
  }

  const set = (k: 'base' | 'head', id: string) => {
    const next = new URLSearchParams(params)
    next.set(k, id)
    if (!next.get('head') && toId) next.set('head', toId)
    if (!next.get('base') && fromId) next.set('base', fromId)
    setParams(next, { replace: true })
  }

  if (all.isLoading) return <PageSkeleton />

  const header = (
    <div>
      <Link to={base} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Timeline
      </Link>
      <h1 className="text-[30px] leading-tight">Compare two moments</h1>
      <p className="mt-1.5 text-muted-foreground">Pick any two points in time to see exactly what's different on the bench.</p>
    </div>
  )

  if (commits.length < 2) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState icon={GitCompareArrows} title="Not enough changes yet">
          Once your bench has at least two changes, you can compare them here.
        </EmptyState>
      </div>
    )
  }

  const changes = from && to ? diffObjects(from.objects_after, to.objects_after) : []

  return (
    <div className="space-y-6">
      {header}
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <MomentPicker commits={commits} value={fromId} onChange={(id) => set('base', id)} label="From" thumbs={thumbs} />
        <Button
          variant="outline"
          size="icon"
          className="mx-auto"
          onClick={() => fromId && toId && setParams({ base: toId, head: fromId }, { replace: true })}
          aria-label="Swap From and To"
          title="Swap"
        >
          <ArrowRight className="hidden md:block" />
          <ArrowUpDown className="md:hidden" />
        </Button>
        <MomentPicker commits={commits} value={toId} onChange={(id) => set('head', id)} label="To" thumbs={thumbs} />
      </div>

      {from && to && (
        <>
          <VisualDiff
            beforeUrl={thumbs[from.id]}
            afterUrl={thumbs[to.id]}
            loading={keyFrames.isLoading || urls.isLoading}
            changes={changes}
            objectsBefore={from.objects_after}
            objectsAfter={to.objects_after}
            highlighted={hovered}
            onHover={setHovered}
            beforeLabel={`From #${from.seq}`}
            afterLabel={`To #${to.seq}`}
          />
          <section className="card p-5" aria-labelledby="diff-heading">
            <h2 id="diff-heading" className="mb-1 flex items-center gap-2 text-lg">
              <ListChecks className="size-5 text-muted-foreground" aria-hidden /> What changed
              <span className="ml-1 rounded-full bg-subtle px-2.5 text-sm font-medium text-muted-foreground">{changes.length}</span>
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Between change #{from.seq} and change #{to.seq}. Point at a line to highlight it.
            </p>
            {from.id === to.id ? (
              <p className="text-muted-foreground">You picked the same moment twice.</p>
            ) : (
              <ChangeList changes={changes} highlighted={hovered} onHover={setHovered} emptyText="These two moments look exactly the same." />
            )}
          </section>
        </>
      )}
    </div>
  )
}
