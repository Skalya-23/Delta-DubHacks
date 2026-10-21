import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Commit, Project, ProjectMember } from '@/lib/types'

/** Every project the current user is a member of. */
export function useMyProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
  })
}

/** Lightweight commit rows across all of the user's projects (dashboard cards + heatmap). */
export type CommitLite = Pick<Commit, 'id' | 'project_id' | 'author_id' | 'status' | 'captured_at' | 'is_hidden' | 'processing_state'>

export function useAllMyCommits() {
  return useQuery({
    queryKey: ['commits', 'all-mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commits')
        .select('id, project_id, author_id, status, captured_at, is_hidden, processing_state')
        .order('captured_at', { ascending: false })
        .limit(5000)
      if (error) throw error
      return data as CommitLite[]
    },
  })
}

/** Resolve `/:owner/:slug` to a project. */
export function useProjectBySlug(owner: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: ['project', owner, slug],
    enabled: Boolean(owner && slug),
    queryFn: async () => {
      const { data: profile, error: pErr } = await supabase.from('profiles').select('id').eq('username', owner!).maybeSingle()
      if (pErr) throw pErr
      if (!profile) return null
      const { data, error } = await supabase.from('projects').select('*').eq('owner_id', profile.id).eq('slug', slug!).maybeSingle()
      if (error) throw error
      return (data as Project) ?? null
    },
  })
}

export function useUpdateProject(project: Project | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Project>) => {
      const { data, error } = await supabase.from('projects').update(patch).eq('id', project!.id).select().single()
      if (error) throw error
      return data as Project
    },
    onSuccess: (updated) => {
      qc.setQueriesData<Project | null>({ queryKey: ['project'] }, (old) => (old && old.id === updated.id ? updated : old))
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ['members', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.from('project_members').select('*').eq('project_id', projectId!)
      if (error) throw error
      return data as ProjectMember[]
    },
  })
}

/** Every membership row you can see (yours and your teammates'), for team avatars on project cards. */
export function useAllMembers() {
  return useQuery({
    queryKey: ['members-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_members').select('*')
      if (error) throw error
      const map: Record<string, ProjectMember[]> = {}
      for (const m of data as ProjectMember[]) (map[m.project_id] ??= []).push(m)
      return map
    },
  })
}
