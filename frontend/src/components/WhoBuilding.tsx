import { HardHat } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useProfiles } from '@/hooks/useProfiles'
import { useUpdateProject } from '@/hooks/useProject'
import type { Project } from '@/lib/types'
import { cn } from '@/lib/utils'
import { UserAvatar } from './UserAvatar'

/** "Who's building" chip. Click it to say it's you. New changes from the camera are credited to this person. */
export function WhoBuilding({ project, className }: { project: Project; className?: string }) {
  const { user } = useAuth()
  const profiles = useProfiles()
  const update = useUpdateProject(project)
  const builder = project.active_user_id ? profiles.data?.[project.active_user_id] : undefined
  const isMe = project.active_user_id === user?.id

  return (
    <button
      type="button"
      disabled={isMe || update.isPending}
      onClick={() =>
        update.mutate({ active_user_id: user!.id }, { onSuccess: () => toast.success("Got it, you're building. New changes will have your name on them.") })
      }
      className={cn(
        'group inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card py-1 pr-4 pl-1.5 text-sm transition-colors',
        !isMe && 'hover:border-brand/60 hover:bg-brand-soft',
        className,
      )}
      title={isMe ? 'New changes are credited to you' : "Click to say you're the one building now"}
    >
      {builder ? (
        <UserAvatar profile={builder} size={28} />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full bg-subtle">
          <HardHat className="size-4 text-muted-foreground" aria-hidden />
        </span>
      )}
      <span>
        <span className="text-muted-foreground">Who's building: </span>
        <span className="font-semibold">{isMe ? 'You' : (builder?.username ?? 'Nobody yet')}</span>
      </span>
      {!isMe && <span className="font-medium text-brand-text group-hover:underline">· That's me</span>}
    </button>
  )
}
