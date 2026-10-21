import { CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import type { CommitStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

export const STATUS_META: Record<CommitStatus, { label: string; icon: typeof CircleCheck; pill: string; dot: string; active: string }> = {
  working: {
    label: 'Works',
    icon: CircleCheck,
    pill: 'bg-works-soft text-works',
    dot: 'bg-works',
    active: 'border-works bg-works text-white dark:text-[#141312]',
  },
  broken: {
    label: 'Broken',
    icon: CircleX,
    pill: 'bg-broken-soft text-broken',
    dot: 'bg-broken',
    active: 'border-broken bg-broken text-white dark:text-[#141312]',
  },
  untested: {
    label: 'Not tested',
    icon: CircleDashed,
    pill: 'bg-untested-soft text-muted-foreground',
    dot: 'bg-untested',
    active: 'border-foreground bg-foreground text-background',
  },
}

/** Rounded pill with a colored dot and the status word. */
export function StatusPill({ status, className, size = 'md' }: { status: CommitStatus; className?: string; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-[13px]',
        m.pill,
        className,
      )}
    >
      <span className={cn('size-2 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  )
}

/** Three big pill buttons: one tap to set the status. */
export function StatusPicker({
  status,
  onChange,
  disabled,
}: {
  status: CommitStatus
  onChange: (s: CommitStatus) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex flex-wrap gap-2" role="radiogroup" aria-label="Does it work?">
      {(['working', 'broken', 'untested'] as const).map((s) => {
        const m = STATUS_META[s]
        const on = s === status
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(s)}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-60',
              on ? m.active : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            <m.icon className="size-4" aria-hidden />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
