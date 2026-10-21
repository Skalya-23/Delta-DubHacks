import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveSession, startRecording, stopRecording } from '@/lib/capture'
import type { CaptureSession } from '@/lib/types'

export const sessionKey = (projectId: string) => ['capture-session', projectId] as const

/** The project's in-progress recording session (kept fresh by useProjectLive over Realtime). */
export function useActiveSession(projectId: string) {
  return useQuery({
    queryKey: sessionKey(projectId),
    queryFn: () => getActiveSession(projectId),
    staleTime: Infinity, // Realtime keeps it current…
    // …but while we're waiting on the Jetson, also poll in case a Realtime message is missed.
    refetchInterval: (q) => (q.state.data?.status === 'requested' || q.state.data?.status === 'stop_requested' ? 3000 : false),
    retry: 1,
  })
}

export function useRecordingControls(projectId: string) {
  const qc = useQueryClient()
  // The mutations only write what the database returned; the button never assumes the next state.
  const start = useMutation({
    mutationFn: () => startRecording(projectId),
    onSuccess: ({ session }) => qc.setQueryData<CaptureSession | null>(sessionKey(projectId), session),
  })
  const stop = useMutation({
    mutationFn: (sessionId: string) => stopRecording(sessionId),
    onSuccess: (session) => {
      if (session) qc.setQueryData<CaptureSession | null>(sessionKey(projectId), session.status === 'stopped' ? null : session)
      else qc.invalidateQueries({ queryKey: sessionKey(projectId) })
    },
  })
  return { start, stop }
}
