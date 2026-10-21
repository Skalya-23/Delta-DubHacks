import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { CaptureSession, CaptureStatus, Commit, ProjectQuestion } from './types'

/** Statuses that count as "a session is in progress". Only one may exist per project (enforced by the database). */
export const ACTIVE_STATUSES: CaptureStatus[] = ['requested', 'recording', 'stop_requested']

export function isActive(s: Pick<CaptureSession, 'status'> | null | undefined): boolean {
  return Boolean(s && ACTIVE_STATUSES.includes(s.status))
}

/** Turn Supabase errors into something worth showing a person. */
function friendly(error: { code?: string; message: string }, action: string): Error {
  if (error.code === '42501') return new Error(`You don't have permission to ${action} in this project.`)
  if (error.code === 'PGRST205' || error.code === '42P01') return new Error('Recording isn’t set up in the database yet (capture_sessions table is missing).')
  if (/failed to fetch/i.test(error.message)) return new Error(`Couldn't reach Supabase to ${action}. Check your connection.`)
  return new Error(`Couldn't ${action}: ${error.message}`)
}

/** The project's in-progress session, if any. */
export async function getActiveSession(projectId: string): Promise<CaptureSession | null> {
  const { data, error } = await supabase
    .from('capture_sessions')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw friendly(error, 'check the recording status')
  return (data as CaptureSession) ?? null
}

/**
 * Ask the Jetson to start recording. Inserts a 'requested' row; the Jetson flips it to 'recording'.
 * If a session is already in progress (unique violation 23505), returns that one instead.
 */
export async function startRecording(projectId: string): Promise<{ session: CaptureSession; alreadyActive: boolean }> {
  const { data, error } = await supabase.from('capture_sessions').insert({ project_id: projectId }).select().single()
  if (!error) return { session: data as CaptureSession, alreadyActive: false }
  if (error.code === '23505') {
    const existing = await getActiveSession(projectId)
    if (existing) return { session: existing, alreadyActive: true }
    // It finished between our insert and our read; ask again.
    return startRecording(projectId)
  }
  throw friendly(error, 'start recording')
}

/**
 * Ask the Jetson to stop. Only moves 'recording' → 'stop_requested'; if the session already moved on,
 * returns its current state instead of overwriting it.
 */
export async function stopRecording(sessionId: string): Promise<CaptureSession | null> {
  const { data, error } = await supabase
    .from('capture_sessions')
    .update({ status: 'stop_requested' })
    .eq('id', sessionId)
    .eq('status', 'recording')
    .select()
    .maybeSingle()
  if (error) throw friendly(error, 'stop recording')
  if (data) return data as CaptureSession
  const { data: current, error: readError } = await supabase.from('capture_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (readError) throw friendly(readError, 'check the recording status')
  return (current as CaptureSession) ?? null
}

export interface WatchHandlers {
  onCommit?: (payload: RealtimePostgresChangesPayload<Commit>) => void
  onSession?: (payload: RealtimePostgresChangesPayload<CaptureSession>) => void
  /** Realtime connection status changes ('SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'). */
  onStatus?: (status: string, error?: Error) => void
}

let channelSeq = 0

/**
 * Listen to every INSERT / UPDATE / DELETE on commits and capture_sessions for one project.
 * Returns a cleanup function that removes the subscription.
 */
export function watchProject(projectId: string, { onCommit, onSession, onStatus }: WatchHandlers): () => void {
  const filter = `project_id=eq.${projectId}`
  const channel = supabase
    .channel(`project:${projectId}:${++channelSeq}`)
    .on<Commit>('postgres_changes', { event: '*', schema: 'public', table: 'commits', filter }, (p) => onCommit?.(p))
    .on<CaptureSession>('postgres_changes', { event: '*', schema: 'public', table: 'capture_sessions', filter }, (p) => onSession?.(p))
    .subscribe((status, err) => onStatus?.(status, err))
  return () => {
    supabase.removeChannel(channel)
  }
}

export function watchQuestions(projectId: string, onChange: (payload: RealtimePostgresChangesPayload<ProjectQuestion>) => void): () => void {
  const channel = supabase
    .channel(`questions:${projectId}:${++channelSeq}`)
    .on<ProjectQuestion>('postgres_changes', { event: '*', schema: 'public', table: 'project_questions', filter: `project_id=eq.${projectId}` }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
