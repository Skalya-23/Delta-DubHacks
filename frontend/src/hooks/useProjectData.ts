import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Checkpoint, CommitNote, ProjectDoc } from '@/lib/types'

export function useCheckpoints(projectId: string | undefined) {
  return useQuery({
    queryKey: ['checkpoints', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkpoints')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Checkpoint[]
    },
  })
}

/** commit id -> checkpoint names, for tag badges. */
export function useCheckpointTags(projectId: string | undefined) {
  const q = useCheckpoints(projectId)
  const tags: Record<string, Checkpoint[]> = {}
  for (const c of q.data ?? []) (tags[c.commit_id] ??= []).push(c)
  return tags
}

export function useNotes(commitId: string | undefined) {
  return useQuery({
    queryKey: ['notes', commitId],
    enabled: Boolean(commitId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commit_notes')
        .select('*')
        .eq('commit_id', commitId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as CommitNote[]
    },
  })
}

export function useNoteMutations(commitId: string, projectId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notes', commitId] })
  const add = useMutation({
    mutationFn: async (body: string) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('commit_notes')
        .insert({ commit_id: commitId, project_id: projectId, body, author_id: u.user?.id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const edit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.from('commit_notes').update({ body }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('commit_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { add, edit, remove }
}

export function useDocs(projectId: string | undefined) {
  return useQuery({
    queryKey: ['docs', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_docs')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ProjectDoc[]
    },
  })
}
