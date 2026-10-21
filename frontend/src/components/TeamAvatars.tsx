import type { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { UserAvatar } from './UserAvatar'

/** Overlapping avatars, e.g. for a project's team. */
export function TeamAvatars({ people, max = 4, size = 28, className }: { people: (Profile | undefined)[]; max?: number; size?: number; className?: string }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  const names = people.map((p) => p?.username ?? 'someone').join(', ')
  return (
    <span className={cn('flex items-center', className)} title={names} aria-label={`Team: ${names}`}>
      {shown.map((p, i) => (
        <UserAvatar key={p?.id ?? i} profile={p} size={size} className={cn('ring-2 ring-card', i > 0 && '-ml-2')} />
      ))}
      {extra > 0 && (
        <span
          className="-ml-2 flex items-center justify-center rounded-full bg-subtle font-mono text-[11px] font-semibold text-muted-foreground ring-2 ring-card"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
