import { CircleAlert, Loader2, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useActiveSession, useRecordingControls } from '@/hooks/useCapture'
import { useProfiles } from '@/hooks/useProfiles'
import { cn } from '@/lib/utils'

/** How long "Starting…" can last before we suggest the Jetson might be offline. */
const STUCK_AFTER_MS = 10_000

/**
 * Start/Stop recording for one project. The label always reflects the capture_sessions row
 * (loaded on mount, then kept live over Realtime), never the click itself:
 * none → "Start recording", requested → "Starting…", recording → "Stop recording", stop_requested → "Stopping…".
 */
export function RecordingButton({ projectId, className }: { projectId: string; className?: string }) {
  const { user } = useAuth()
  const profiles = useProfiles()
  const session = useActiveSession(projectId)
  const { start, stop } = useRecordingControls(projectId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const s = session.data
  // Tick once a second while we wait for the Jetson to pick up a request.
  useEffect(() => {
    if (s?.status !== 'requested') return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [s?.status])

  const stuck = s?.status === 'requested' && now - new Date(s.created_at).getTime() >= STUCK_AFTER_MS
  const starter = s?.started_by ? (s.started_by === user?.id ? 'you' : (profiles.data?.[s.started_by]?.username ?? 'a teammate')) : null

  const onStart = () => {
    setActionError(null)
    start.mutate(undefined, {
      onSuccess: ({ session: existing, alreadyActive }) => {
        if (alreadyActive) toast.info(`A recording is already ${existing.status === 'recording' ? 'running' : 'in progress'} for this project.`)
      },
      onError: (e) => {
        setActionError(e.message)
        toast.error(e.message)
      },
    })
  }
  const onStop = () => {
    if (!s) return
    setActionError(null)
    stop.mutate(s.id, {
      onError: (e) => {
        setActionError(e.message)
        toast.error(e.message)
      },
    })
  }

  if (session.isLoading) return <Skeleton className={cn('h-10 w-44 rounded-full', className)} />

  let control: React.ReactNode
  if (session.error) {
    control = (
      <Button variant="outline" onClick={() => session.refetch()}>
        <CircleAlert className="text-broken" /> Retry
      </Button>
    )
  } else if (!s) {
    control = (
      <Button variant="primary" onClick={onStart} disabled={start.isPending}>
        {start.isPending ? <Loader2 className="animate-spin" /> : <span className="size-2.5 rounded-full bg-white" aria-hidden />}
        Start recording
      </Button>
    )
  } else if (s.status === 'requested') {
    control = (
      <Button variant="outline" disabled aria-live="polite">
        <Loader2 className="animate-spin" /> Starting…
      </Button>
    )
  } else if (s.status === 'recording') {
    control = (
      <div className="flex items-center gap-2">
        <span className="inline-flex h-10 items-center gap-2 rounded-full bg-broken-soft px-3.5 text-sm font-semibold text-broken" role="status">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-broken opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-broken" />
          </span>
          Recording
        </span>
        <Button variant="outline" onClick={onStop} disabled={stop.isPending} className="border-broken/40 text-broken hover:bg-broken-soft hover:text-broken">
          {stop.isPending ? <Loader2 className="animate-spin" /> : <Square className="fill-current" />}
          Stop recording
        </Button>
      </div>
    )
  } else {
    control = (
      <Button variant="outline" disabled aria-live="polite">
        <Loader2 className="animate-spin" /> Stopping…
      </Button>
    )
  }

  return (
    <div className={cn('flex flex-col items-end gap-1', className)} role="group" aria-label="Recording controls">
      {control}
      {session.error && (
        <p className="max-w-xs text-right text-xs text-broken" role="alert">
          {(session.error as Error).message}
        </p>
      )}
      {actionError && !session.error && (
        <p className="max-w-xs text-right text-xs text-broken" role="alert">
          {actionError}
        </p>
      )}
      {stuck && (
        <p className="max-w-xs text-right text-xs text-muted-foreground" role="status">
          Still waiting for the camera. The Jetson may be offline or not running.
        </p>
      )}
      {s?.status === 'recording' && starter && <p className="text-xs text-muted-foreground">Started by {starter}</p>}
    </div>
  )
}
