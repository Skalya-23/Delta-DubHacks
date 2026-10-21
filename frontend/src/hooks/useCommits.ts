import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sanitizeSearch } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Commit, CommitStatus, Frame } from '@/lib/types'

/** Every commit in a project, newest first. Used for stats, heatmap, pickers and prev/next. */
export function useProjectCommits(projectId: string | undefined) {
  return useQuery({
    queryKey: ['commits', projectId, 'all'],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commits')
        .select('*')
        .eq('project_id', projectId!)
        .order('captured_at', { ascending: false })
        .order('seq', { ascending: false })
      if (error) throw error
      return data as Commit[]
    },
  })
}

export interface CommitFilters {
  status: 'all' | CommitStatus
  showHidden: boolean
  search: string
}

/** The commits list page, filtered server-side. */
export function useFilteredCommits(projectId: string | undefined, f: CommitFilters) {
  return useQuery({
    queryKey: ['commits', projectId, 'filtered', f],
    enabled: Boolean(projectId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from('commits').select('*').eq('project_id', projectId!)
      if (f.status !== 'all') q = q.eq('status', f.status)
      if (!f.showHidden) q = q.eq('is_hidden', false)
      const s = sanitizeSearch(f.search)
      if (s) q = q.or(`title.ilike.%${s}%,mk1_summary.ilike.%${s}%,user_description.ilike.%${s}%`)
      const { data, error } = await q.order('captured_at', { ascending: false }).order('seq', { ascending: false })
      if (error) throw error
      return data as Commit[]
    },
  })
}

export function useCommit(commitId: string | undefined) {
  return useQuery({
    queryKey: ['commit', commitId],
    enabled: Boolean(commitId),
    queryFn: async () => {
      const { data, error } = await supabase.from('commits').select('*').eq('id', commitId!).maybeSingle()
      if (error) throw error
      return (data as Commit) ?? null
    },
  })
}

export function useUpdateCommit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Commit> }) => {
      const { data, error } = await supabase.from('commits').update(patch).eq('id', id).select().single()
      if (error) throw error
      return data as Commit
    },
    onSuccess: (c) => {
      qc.setQueryData(['commit', c.id], c)
      qc.invalidateQueries({ queryKey: ['commits'] })
    },
  })
}

const kindOrder = { before: 0, sequence: 1, after: 2 } as const

export function sortFrames(frames: Frame[]): Frame[] {
  return [...frames].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.frame_index - b.frame_index)
}

/** Frames of one commit in display order: before, sequence..., after. */
export function useFrames(commitId: string | undefined) {
  return useQuery({
    queryKey: ['frames', commitId],
    enabled: Boolean(commitId),
    queryFn: async () => {
      const { data, error } = await supabase.from('frames').select('*').eq('commit_id', commitId!)
      if (error) throw error
      return sortFrames(data as Frame[])
    },
  })
}

/** Map of commit id -> { before, after } storage paths for a whole project (thumbnails, compare, restore). */
export function useProjectKeyFrames(projectId: string | undefined) {
  return useQuery({
    queryKey: ['frames', 'project', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('frames')
        .select('commit_id, kind, storage_path')
        .eq('project_id', projectId!)
        .in('kind', ['before', 'after'])
      if (error) throw error
      const map: Record<string, { before?: string; after?: string }> = {}
      for (const f of data as Pick<Frame, 'commit_id' | 'kind' | 'storage_path'>[]) {
        map[f.commit_id] ??= {}
        if (f.kind === 'before') map[f.commit_id].before = f.storage_path
        if (f.kind === 'after') map[f.commit_id].after = f.storage_path
      }
      return map
    },
  })
}

/** "after" frame paths for a specific set of commits (e.g. the latest change of each project). */
export function useAfterFramesFor(commitIds: string[]) {
  const ids = [...commitIds].sort()
  return useQuery({
    queryKey: ['frames', 'after-for', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('frames').select('commit_id, storage_path').eq('kind', 'after').in('commit_id', ids)
      if (error) throw error
      const map: Record<string, string> = {}
      for (const f of data as Pick<Frame, 'commit_id' | 'storage_path'>[]) map[f.commit_id] = f.storage_path
      return map
    },
  })
}
