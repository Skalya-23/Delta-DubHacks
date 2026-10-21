import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

// Warm, workshop-y palette (no brand orange, so avatars never look like buttons).
const COLORS = ['#0D9488', '#7C3AED', '#DB2777', '#2563EB', '#CA8A04', '#059669', '#9333EA', '#475569']

function colorFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function UserAvatar({ profile, size = 20, className }: { profile?: Profile | null; size?: number; className?: string }) {
  const name = profile?.username ?? '?'
  return (
    <Avatar className={cn('shrink-0', className)} style={{ width: size, height: size }} title={profile ? name : 'Unknown'}>
      <AvatarFallback
        className="font-semibold text-white"
        style={{ backgroundColor: profile ? colorFor(profile.id) : '#8A8378', fontSize: Math.max(9, size * 0.44) }}
      >
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
