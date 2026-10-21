import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CaptureSession, ProjectQuestion } from '@/lib/types'

const NOT_MIGRATED = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

export const sessionSummariesKey = (projectId: string) => ['session-summaries', projectId] as const
export const questionsKey = (projectId: string) => ['questions', projectId] as const

export function useSessionSummaries(projectId: string, limit = 3) {
  return useQuery({
    queryKey: sessionSummariesKey(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capture_sessions')
        .select('*')
        .eq('project_id', projectId)
        .not('summary_state', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) {
        if (error.code && NOT_MIGRATED.has(error.code)) return []
        throw error
      }
      return data as CaptureSession[]
    },
    refetchInterval: (q) => (q.state.data?.some((s) => s.summary_state === 'pending') ? 5000 : false),
  })
}

export function useQuestions(projectId: string) {
  return useQuery({
    queryKey: questionsKey(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_questions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        if (error.code && NOT_MIGRATED.has(error.code)) return null
        throw error
      }
      return (data as ProjectQuestion[]).reverse()
    },
    refetchInterval: (q) => (q.state.data?.some((x) => x.state === 'pending') ? 4000 : false),
  })
}

export function useAskQuestion(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (question: string) => {
      const { data, error } = await supabase.from('project_questions').insert({ project_id: projectId, question }).select().single()
      if (error) throw new Error(error.code === '42501' ? "You don't have permission to ask in this project." : `Couldn't send your question: ${error.message}`)
      return data as ProjectQuestion
    },
    onSuccess: (q) => qc.setQueryData<ProjectQuestion[] | null>(questionsKey(projectId), (old) => [...(old ?? []), q]),
  })
}

export function useDeleteQuestion(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_questions').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return id
    },
    onSuccess: (id) => qc.setQueryData<ProjectQuestion[] | null>(questionsKey(projectId), (old) => (old ?? []).filter((q) => q.id !== id)),
  })
}
