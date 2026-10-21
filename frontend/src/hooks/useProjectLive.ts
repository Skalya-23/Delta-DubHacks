import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isActive, watchProject } from '@/lib/capture'
import { commitTitle } from '@/lib/format'
import type { CaptureSession, Commit } from '@/lib/types'
import { sessionSummariesKey } from './useAiFeatures'
import { sessionKey } from './useCapture'

/**
 * Keeps a project page live: new/updated changes and recording status arrive over Realtime and are
 * written into the React Query cache. Unsubscribes when the page unmounts or the project changes.
 * Returns the ids of changes that arrived while the page was open (for the slide-in highlight).
 */
export function useProjectLive(projectId: string | undefined) {
  const qc = useQueryClient()
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(true)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!projectId) return
    const pending = timers.current

    const onCommit = (payload: { eventType: string; new: unknown; old: unknown }) => {
      qc.invalidateQueries({ queryKey: ['commits'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
      if (payload.eventType === 'DELETE') return
      const c = payload.new as Commit
      if (payload.eventType === 'INSERT') {
        // New change: show it right away as a processing card, highlighted.
        qc.invalidateQueries({ queryKey: ['frames', 'project', projectId] })
        setFreshIds((s) => new Set(s).add(c.id))
        pending.push(
          window.setTimeout(() => {
            setFreshIds((s) => {
              const n = new Set(s)
              n.delete(c.id)
              return n
            })
          }, 4000),
        )
        toast(`New change on the bench: #${c.seq}`, { description: c.processing_state === 'pending' ? 'The AI is looking at it…' : commitTitle(c) })
        return
      }
      // UPDATE: refresh this change and (re)load its photos. Frames rows usually land with or after stage 2.
      const prev = qc.getQueryData<Commit | null>(['commit', c.id])
      qc.setQueryData(['commit', c.id], c)
      qc.invalidateQueries({ queryKey: ['frames'] })
      if (prev?.processing_state !== c.processing_state) {
        if (c.processing_state === 'described') toast.success(`Change #${c.seq}: the AI is done`, { description: c.mk1_summary ?? commitTitle(c) })
        if (c.processing_state === 'failed') toast.error(`Change #${c.seq}: the AI couldn't read it`, { description: c.mk1_summary ?? undefined })
      }
    }

    const onSession = (payload: { eventType: string; new: unknown; old: unknown }) => {
      const key = sessionKey(projectId)
      if (payload.eventType === 'DELETE') {
        qc.invalidateQueries({ queryKey: key })
        return
      }
      const s = payload.new as CaptureSession
      qc.invalidateQueries({ queryKey: sessionSummariesKey(projectId) })
      if (payload.eventType === 'UPDATE' && s.summary_state === 'ready' && s.summary) {
        toast('Session summary is ready', { description: s.summary.length > 140 ? `${s.summary.slice(0, 140)}…` : s.summary })
      }
      const current = qc.getQueryData<CaptureSession | null>(key)
      if (isActive(s)) qc.setQueryData(key, s)
      else if (!current || current.id === s.id) qc.setQueryData(key, null) // our session finished
    }

    const cleanup = watchProject(projectId, {
      onCommit,
      onSession,
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          // Catch anything that happened while we weren't listening (first load or a reconnect).
          qc.invalidateQueries({ queryKey: sessionKey(projectId) })
          qc.invalidateQueries({ queryKey: ['commits', projectId] })
          // Realtime can take a moment after SUBSCRIBED before events flow; check once more to close that gap.
          pending.push(window.setTimeout(() => qc.invalidateQueries({ queryKey: sessionKey(projectId) }), 2500))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false)
        }
      },
    })
    return () => {
      pending.forEach((t) => window.clearTimeout(t))
      cleanup()
    }
  }, [projectId, qc])

  return { freshIds, connected }
}
