import { describeRegion } from '@/lib/regions'
import type { Change } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CHANGE_META } from './Pills'

/** One plain sentence per change, e.g. "DC motor moved from the top left to the center". */
export function changeSentence(c: Change): string {
  if (c.type === 'added' && c.to) return `${c.name} added at the ${describeRegion(c.to)}`
  if (c.type === 'removed' && c.from) return `${c.name} removed from the ${describeRegion(c.from)}`
  if (c.type === 'moved' && c.from && c.to) {
    const a = describeRegion(c.from)
    const b = describeRegion(c.to)
    return a === b ? `${c.name} ${c.detail.toLowerCase()} (still at the ${b})` : `${c.name} moved from the ${a} to the ${b}`
  }
  return `${c.name} ${c.type}`
}

export function ChangeList({
  changes,
  highlighted,
  onHover,
  emptyText = 'Nothing on the bench moved.',
}: {
  changes: Change[]
  highlighted?: number | null
  onHover?: (i: number | null) => void
  emptyText?: string
}) {
  if (changes.length === 0) {
    return <p className="rounded-xl bg-subtle px-4 py-5 text-center text-muted-foreground">{emptyText}</p>
  }
  return (
    <ul className="space-y-2" aria-label="What changed">
      {changes.map((c, i) => {
        const m = CHANGE_META[c.type]
        return (
          <li
            key={`${c.type}-${c.name}-${i}`}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              highlighted === i ? 'border-transparent ' + m.chip : 'border-border hover:bg-subtle',
            )}
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(i)}
            onBlur={() => onHover?.(null)}
            tabIndex={0}
          >
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', m.chip)}>
              <m.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="sr-only">{m.verb}: </span>
              {changeSentence(c)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
