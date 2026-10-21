import { ChevronLeft, ChevronRight, Columns2, SplitSquareHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ReactCompareSlider, ReactCompareSliderHandle } from 'react-compare-slider'
import { Switch } from '@/components/ui/switch'
import type { BenchObject, Change } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BoxOverlay, type OverlayBox } from './BoxOverlay'
import { FrameImage } from './FrameImage'

export function diffBoxes(changes: Change[]): { before: OverlayBox[]; after: OverlayBox[] } {
  const before: OverlayBox[] = []
  const after: OverlayBox[] = []
  changes.forEach((c, i) => {
    if (c.type === 'removed' && c.from) before.push({ key: `r${i}`, box: c.from, tone: 'removed', label: `− ${c.name}`, changeIndex: i })
    if (c.type === 'added' && c.to) after.push({ key: `a${i}`, box: c.to, tone: 'added', label: `+ ${c.name}`, changeIndex: i })
    if (c.type === 'moved') {
      if (c.from) before.push({ key: `mb${i}`, box: c.from, tone: 'moved', label: c.name, changeIndex: i })
      if (c.to) after.push({ key: `ma${i}`, box: c.to, tone: 'moved', label: c.name, changeIndex: i })
    }
  })
  return { before, after }
}

/** Objects that didn't change, drawn faintly for context. */
function unchangedBoxes(objects: BenchObject[], changes: Change[], side: 'from' | 'to'): OverlayBox[] {
  const changed = changes.map((c) => c[side]).filter(Boolean)
  return objects
    .filter((o) => !changed.some((b) => b && Math.abs(b.x - o.x) < 1e-6 && Math.abs(b.y - o.y) < 1e-6))
    .map((o) => ({ key: `n-${o.id}-${o.x}`, box: o, tone: 'neutral' as const, label: o.name }))
}

interface NavTarget {
  to: string
  label: string
}

/** Big before/after viewer. Defaults to the drag slider; can switch to side by side. */
export function VisualDiff({
  beforeUrl,
  afterUrl,
  loading,
  changes,
  objectsBefore = [],
  objectsAfter = [],
  highlighted,
  onHover,
  beforeLabel = 'Before',
  afterLabel = 'After',
  defaultMode = 'slider',
  prev,
  next,
}: {
  beforeUrl?: string
  afterUrl?: string
  loading?: boolean
  changes: Change[]
  objectsBefore?: BenchObject[]
  objectsAfter?: BenchObject[]
  highlighted?: number | null
  onHover?: (i: number | null) => void
  beforeLabel?: string
  afterLabel?: string
  defaultMode?: 'slider' | 'side'
  prev?: NavTarget
  next?: NavTarget
}) {
  const [mode, setMode] = useState(defaultMode)
  const [showAll, setShowAll] = useState(false)
  const { before, after } = diffBoxes(changes)
  const beforeBoxes = showAll ? [...unchangedBoxes(objectsBefore, changes, 'from'), ...before] : before
  const afterBoxes = showAll ? [...unchangedBoxes(objectsAfter, changes, 'to'), ...after] : after

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="inline-flex rounded-full bg-subtle p-1" role="group" aria-label="Viewer mode">
          {(
            [
              ['slider', 'Slider', SplitSquareHorizontal],
              ['side', 'Side by side', Columns2],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="hidden items-center gap-3 sm:flex">
            <Legend color="var(--added)" label="Added" />
            <Legend color="var(--removed)" label="Removed" />
            <Legend color="var(--moved)" label="Moved" />
          </span>
          <label className="flex items-center gap-2">
            <Switch checked={showAll} onCheckedChange={setShowAll} aria-label="Show every part" />
            Show every part
          </label>
        </div>
      </div>

      <div className="relative px-4 pb-4">
        {mode === 'side' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Pane label={beforeLabel}>
              <FrameImage url={beforeUrl} loading={loading} alt={`${beforeLabel} photo`}>
                <BoxOverlay boxes={beforeBoxes} highlighted={highlighted} onHover={onHover} />
              </FrameImage>
            </Pane>
            <Pane label={afterLabel}>
              <FrameImage url={afterUrl} loading={loading} alt={`${afterLabel} photo`}>
                <BoxOverlay boxes={afterBoxes} highlighted={highlighted} onHover={onHover} />
              </FrameImage>
            </Pane>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="relative overflow-hidden rounded-xl">
              <ReactCompareSlider
                handle={<ReactCompareSliderHandle buttonStyle={{ backgroundColor: 'var(--brand)', border: 0, color: '#fff', backdropFilter: 'none' }} linesStyle={{ background: '#fff', width: 3 }} />}
                itemOne={
                  <FrameImage url={beforeUrl} loading={loading} alt={`${beforeLabel} photo`}>
                    <BoxOverlay boxes={beforeBoxes} highlighted={highlighted} />
                  </FrameImage>
                }
                itemTwo={
                  <FrameImage url={afterUrl} loading={loading} alt={`${afterLabel} photo`}>
                    <BoxOverlay boxes={afterBoxes} highlighted={highlighted} />
                  </FrameImage>
                }
              />
              <span className="pointer-events-none absolute top-3 left-3 z-10 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">{beforeLabel}</span>
              <span className="pointer-events-none absolute top-3 right-3 z-10 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">{afterLabel}</span>
            </div>
            <p className="mt-2 text-center text-sm text-muted-foreground">Drag the orange handle to see before and after</p>
          </div>
        )}
        {prev && <SideArrow side="left" target={prev} />}
        {next && <SideArrow side="right" target={next} />}
      </div>
    </div>
  )
}

function SideArrow({ side, target }: { side: 'left' | 'right'; target: NavTarget }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <Link
      to={target.to}
      aria-label={target.label}
      title={target.label}
      className={cn(
        'absolute top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:border-brand hover:text-brand-text',
        side === 'left' ? 'left-1' : 'right-1',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </Link>
  )
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure>
      <figcaption className="mb-1.5 text-sm font-semibold text-muted-foreground">{label}</figcaption>
      <div className="overflow-hidden rounded-xl">{children}</div>
    </figure>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-3 rounded-[4px] border-2" style={{ borderColor: color }} aria-hidden />
      {label}
    </span>
  )
}
