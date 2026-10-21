import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Checkpoint, Commit, CommitNote } from '@/lib/types'

export type FeedItem =
  | { kind: 'change'; id: string; at: string; projectId: string; userId: string | null; commit: Commit }
  | { kind: 'checkpoint'; id: string; at: string; projectId: string; userId: string | null; checkpoint: Checkpoint; commit?: Commit }
  | { kind: 'comment'; id: string; at: string; projectId: string; userId: string | null; note: CommitNote; commit?: Commit }

/**
 * Everything happening across every project you're a member of: new changes, checkpoints and comments.
 * Row Level Security makes sure you only ever see projects you belong to.
 */
export function useFeed(limit = 60) {
  return useQuery({
    queryKey: ['feed', limit],
    queryFn: async () => {
      const [commits, checkpoints, notes] = await Promise.all([
        supabase.from('commits').select('*').eq('is_hidden', false).order('captured_at', { ascending: false }).limit(limit),
        supabase.from('checkpoints').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('commit_notes').select('*').order('created_at', { ascending: false }).limit(30),
      ])
      for (const r of [commits, checkpoints, notes]) if (r.error) throw r.error
      const commitRows = (commits.data ?? []) as Commit[]
      const byId = new Map(commitRows.map((c) => [c.id, c]))

      // Fetch the changes that checkpoints/comments point at but aren't in the recent list.
      const missing = [...new Set([...(checkpoints.data ?? []), ...(notes.data ?? [])].map((x) => x.commit_id))].filter((id) => !byId.has(id))
      if (missing.length) {
        const extra = await supabase.from('commits').select('*').in('id', missing)
        if (extra.error) throw extra.error
        for (const c of extra.data as Commit[]) byId.set(c.id, c)
      }

      const items: FeedItem[] = [
        ...commitRows.map((c) => ({ kind: 'change' as const, id: `c-${c.id}`, at: c.captured_at, projectId: c.project_id, userId: c.author_id, commit: c })),
        ...((checkpoints.data ?? []) as Checkpoint[]).map((cp) => ({
          kind: 'checkpoint' as const,
          id: `k-${cp.id}`,
          at: cp.created_at,
          projectId: cp.project_id,
          userId: cp.created_by,
          checkpoint: cp,
          commit: byId.get(cp.commit_id),
        })),
        ...((notes.data ?? []) as CommitNote[]).map((n) => ({
          kind: 'comment' as const,
          id: `n-${n.id}`,
          at: n.created_at,
          projectId: n.project_id,
          userId: n.author_id,
          note: n,
          commit: byId.get(n.commit_id),
        })),
      ]
      return items.sort((a, b) => b.at.localeCompare(a.at))
    },
  })
}

/** Refresh the feed when any change you can see is added or updated. */
export function useFeedRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('feed:commits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commits' }, () => {
        qc.invalidateQueries({ queryKey: ['feed'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
