import { ArrowLeftRight, Flag, Minus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Change, Checkpoint } from '@/lib/types'
import { cn } from '@/lib/utils'

export const CHANGE_META = {
  added: { icon: Plus, verb: 'added', chip: 'bg-added-soft text-added', color: 'var(--added)' },
  removed: { icon: Minus, verb: 'removed', chip: 'bg-removed-soft text-removed', color: 'var(--removed)' },
  moved: { icon: ArrowLeftRight, verb: 'moved', chip: 'bg-moved-soft text-[var(--moved-text)]', color: 'var(--moved)' },
} as const

/** Small chips like "↔ DC motor moved", "+ Servo added". */
export function ChangeChips({ changes, max = 3, className }: { changes: Change[]; max?: number; className?: string }) {
  if (changes.length === 0) return <span className={cn('text-xs text-muted-foreground', className)}>Nothing moved</span>
  const shown = changes.slice(0, max)
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((c, i) => {
        const m = CHANGE_META[c.type]
        return (
          <span key={i} className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium', m.chip)}>
            <m.icon className="size-3" aria-hidden />
            {c.name} {m.verb}
          </span>
        )
      })}
      {changes.length > max && <span className="text-xs text-muted-foreground">+{changes.length - max} more</span>}
    </span>
  )
}

export function AnalyzingLine({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-sm text-ai', className)} aria-live="polite">
      <span className="shimmer inline-block h-2 w-16 rounded-full" aria-hidden />
      AI is looking at this change…
    </span>
  )
}

export function FailedPill() {
  return <span className="inline-flex h-6 items-center rounded-full bg-broken-soft px-2.5 text-xs font-medium text-broken">AI couldn't read this one</span>
}

export function CheckpointFlag({ checkpoint, to, className }: { checkpoint: Checkpoint; to?: string; className?: string }) {
  const cls = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-full bg-brand px-3 text-xs font-semibold text-white shadow-sm shadow-brand/25',
    to && 'hover:brightness-105',
    className,
  )
  const inner = (
    <>
      <Flag className="size-3.5" aria-hidden />
      <span className="sr-only">Checkpoint: </span>
      {checkpoint.name}
    </>
  )
  return to ? (
    <Link to={to} className={cls} onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  )
}
