import { format } from 'date-fns'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useSessionSummaries } from '@/hooks/useAiFeatures'
import { useProfiles } from '@/hooks/useProfiles'
import type { CaptureSession } from '@/lib/types'
import { UserAvatar } from './UserAvatar'

function sessionTime(s: CaptureSession) {
  const start = new Date(s.created_at)
  const label = format(start, 'MMM d, h:mm a')
  if (!s.stopped_at) return label
  const minutes = Math.max(1, Math.round((new Date(s.stopped_at).getTime() - start.getTime()) / 60000))
  return `${label} · ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`}`
}

export function SessionSummaries({ projectId }: { projectId: string }) {
  const sessions = useSessionSummaries(projectId)
  const profiles = useProfiles()
  if (!sessions.data?.length) return null

  return (
    <section className="card rise overflow-hidden border-ai/30" aria-labelledby="sessions-heading">
      <div className="flex items-center gap-2 bg-ai-soft px-5 py-3">
        <Sparkles className="size-4 text-ai" aria-hidden />
        <h2 id="sessions-heading" className="text-base">
          Work sessions
        </h2>
        <span className="ml-auto rounded-full border border-ai/30 px-2.5 py-0.5 text-xs font-medium text-ai">Perceptron Mk1</span>
      </div>
      <ol className="divide-y divide-border">
        {sessions.data.map((s) => {
          const starter = s.started_by ? profiles.data?.[s.started_by] : undefined
          return (
            <li key={s.id} className="space-y-1.5 px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {starter && <UserAvatar profile={starter} size={18} />}
                <span>
                  {starter ? <span className="font-medium text-foreground">{starter.username}</span> : 'Someone'} recorded · {sessionTime(s)}
                </span>
                {s.summary_state === 'ready' && s.change_count != null && (
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium">
                    {s.change_count} change{s.change_count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {s.summary_state === 'pending' && (
                <div className="space-y-2" aria-live="polite">
                  <p className="text-sm text-ai">Writing a summary of this session…</p>
                  <div className="shimmer h-3 w-4/5 rounded-full" />
                </div>
              )}
              {s.summary_state === 'ready' && <p className="leading-relaxed text-ai">{s.summary}</p>}
              {s.summary_state === 'failed' && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-broken" aria-hidden />
                  {s.summary || "The AI couldn't summarize this session."}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
