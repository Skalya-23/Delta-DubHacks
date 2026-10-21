import { ArrowLeft, Check, CheckCircle2, ImageOff, PackageMinus, PackagePlus, RotateCcw, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BoxOverlay, type OverlayBox } from '@/components/BoxOverlay'
import { EmptyState } from '@/components/EmptyState'
import { FrameImage } from '@/components/FrameImage'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatusPill } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useProjectCommits, useProjectKeyFrames } from '@/hooks/useCommits'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { describeRegion, diffObjects } from '@/lib/diff'
import { commitTitle } from '@/lib/format'
import type { Change } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Turn a diff (bench now -> target) into steps.
 * In diffObjects(now, target): "removed" = on the bench now but not in the target, "added" = missing now.
 */
function step(c: Change): { text: string; icon: typeof RotateCcw } {
  if (c.type === 'moved') return { text: `Move the ${c.name} back to the ${describeRegion(c.to!)}`, icon: RotateCcw }
  if (c.type === 'removed') return { text: `Take the ${c.name} off the bench (it's at the ${describeRegion(c.from!)})`, icon: PackageMinus }
  return { text: `Put the ${c.name} back at the ${describeRegion(c.to!)}`, icon: PackagePlus }
}

const CONFETTI_COLORS = ['#FF5B1F', '#16A34A', '#F59E0B', '#0D9488', '#7C3AED', '#E11D48']

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${(i * 37) % 100}%`,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 7) * 60}ms`,
              '--dx': `${((i * 53) % 80) - 40}px`,
              '--rot': `${(i * 97) % 720}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function GoBack() {
  const { changeId } = useParams()
  // Keyed so the checklist resets when switching targets.
  return <GoBackView key={changeId} changeId={changeId} />
}

function GoBackView({ changeId }: { changeId?: string }) {
  const { project, base } = useProjectCtx()
  const all = useProjectCommits(project.id)
  const keyFrames = useProjectKeyFrames(project.id)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [streamFailed, setStreamFailed] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)

  const target = all.data?.find((c) => c.id === changeId)
  const latest = all.data?.find((c) => !c.is_hidden && c.processing_state === 'described')
  const latestPath = latest ? keyFrames.data?.[latest.id]?.after : undefined
  const targetPath = target ? keyFrames.data?.[target.id]?.after : undefined
  const urls = useSignedUrls([latestPath, targetPath])

  if (all.isLoading) return <PageSkeleton />
  if (!target) {
    return (
      <EmptyState icon={SearchX} title="We couldn't find that change">
        <Link to={base} className="font-medium text-brand-text underline underline-offset-2">
          Pick one from the timeline
        </Link>
      </EmptyState>
    )
  }

  const changes = latest ? diffObjects(latest.objects_after, target.objects_after) : []
  const steps = changes.map(step)
  const done = steps.length > 0 && checked.size === steps.length
  const useStream = Boolean(project.live_stream_url) && !streamFailed
  const pct = steps.length ? Math.round((checked.size / steps.length) * 100) : 100

  const ghosts: OverlayBox[] = target.objects_after.map((o) => {
    const ci = changes.findIndex((c) => c.to && c.name === o.name && c.to.x === o.x && c.to.y === o.y)
    return { key: o.id + o.x, box: o, tone: 'ghost', label: o.name, changeIndex: ci >= 0 ? ci : undefined }
  })
  const takeOff: OverlayBox[] = changes.flatMap((c, i) =>
    c.type === 'removed' && c.from ? [{ key: `rm${i}`, box: c.from, tone: 'removed' as const, label: `Take off`, changeIndex: i }] : [],
  )
  const toggle = (i: number, on: boolean) =>
    setChecked((prev) => {
      const n = new Set(prev)
      if (on) n.add(i)
      else n.delete(i)
      return n
    })

  return (
    <div className="space-y-6">
      <div>
        <Link to={`${base}/change/${target.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Change #{target.seq}
        </Link>
        <h1 className="text-[30px] leading-tight">Go back to change #{target.seq}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-muted-foreground">
          Put your bench back the way it was: "{commitTitle(target)}" <StatusPill status={target.status} size="sm" />
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-3">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              {useStream ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-broken px-2.5 py-0.5 text-xs font-semibold text-white">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
                </span>
              ) : (
                <span className="font-semibold">Latest photo {latest && <span className="font-mono font-normal text-muted-foreground">#{latest.seq}</span>}</span>
              )}
              <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                <span className="inline-block h-3 w-5 rounded-[4px] border-2 border-dashed border-brand" aria-hidden />
                where things should go
              </span>
            </div>
            <div className="px-4 pb-4">
              {useStream ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <img src={project.live_stream_url!} alt="Live camera view of the bench" className="block h-auto w-full" onError={() => setStreamFailed(true)} />
                  <BoxOverlay boxes={[...ghosts, ...takeOff]} highlighted={hovered} />
                </div>
              ) : latestPath ? (
                <div className="overflow-hidden rounded-xl">
                  <FrameImage url={urls.data?.[latestPath]} loading={urls.isLoading} alt="Latest photo of the bench">
                    <BoxOverlay boxes={[...ghosts, ...takeOff]} highlighted={hovered} />
                  </FrameImage>
                </div>
              ) : (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-subtle text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden /> No photo of the bench yet.
                </div>
              )}
            </div>
          </div>
          {targetPath && (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-medium">Show how the bench looked at change #{target.seq}</summary>
              <div className="mt-3 overflow-hidden rounded-xl">
                <FrameImage url={urls.data?.[targetPath]} loading={urls.isLoading} alt={`The bench at change #${target.seq}`} />
              </div>
            </details>
          )}
        </div>

        <aside className="card relative h-fit overflow-visible lg:sticky lg:top-6" aria-label="Steps to go back">
          <div className="p-5 pb-4">
            <h2 className="text-xl">Your steps</h2>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {checked.size}/{steps.length}
              </span>
            </div>
          </div>
          {!latest ? (
            <p className="px-5 pb-5 text-muted-foreground">There's no photo of the bench to compare with yet.</p>
          ) : steps.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 pb-6 text-center">
              <CheckCircle2 className="size-10 text-works" aria-hidden />
              <p className="font-heading text-lg font-semibold">Already there!</p>
              <p className="text-muted-foreground">Your bench already matches change #{target.seq}.</p>
            </div>
          ) : (
            <ol className="space-y-2 px-3 pb-3">
              {steps.map((s, i) => {
                const on = checked.has(i)
                return (
                  <li key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors hover:bg-subtle', on && 'bg-works-soft hover:bg-works-soft')}>
                      <Checkbox checked={on} onCheckedChange={(v) => toggle(i, Boolean(v))} className="mt-0.5 size-6 rounded-lg" aria-label={s.text} />
                      <span className="flex-1">
                        <span className="mb-0.5 block text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                        <span className={cn('text-[15px]', on && 'text-muted-foreground line-through')}>{s.text}</span>
                      </span>
                      <s.icon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </label>
                  </li>
                )
              })}
            </ol>
          )}
          {done && (
            <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })} className="relative border-t border-border p-5 text-center">
              <Confetti />
              <span className="pop mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-works text-white">
                <Check className="size-8" strokeWidth={3} aria-hidden />
              </span>
              <p className="font-heading text-xl font-semibold">Your bench is back to Change #{target.seq}.</p>
              <p className="mt-1 text-sm text-muted-foreground">The camera will save the restored bench as a new change.</p>
              <Button
                variant="primary"
                className="mt-4 w-full"
                onClick={() => toast.success(`Nice! Back to change #${target.seq}.`, { description: 'Test it, then mark the next change as Works.' })}
              >
                All done
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
