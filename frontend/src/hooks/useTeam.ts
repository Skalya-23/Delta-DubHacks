import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProjectInvite } from '@/lib/types'

/** True when the invite-links migration hasn't been run on this database yet. */
export function isMissingInvitesTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return Boolean(e && (e.code === 'PGRST205' || e.code === '42P01' || e.code === 'PGRST202' || /project_invites|accept_invite|invite_preview/.test(e.message ?? '')))
}

export function useInvites(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['invites', projectId],
    enabled: Boolean(projectId) && enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_invites')
        .select('*')
        .eq('project_id', projectId!)
        .eq('revoked', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ProjectInvite[]
    },
  })
}

export function useTeamMutations(projectId: string) {
  const qc = useQueryClient()
  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: userId, role: 'member' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', projectId] })
      qc.invalidateQueries({ queryKey: ['members-all'] })
    },
  })
  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', projectId] })
      qc.invalidateQueries({ queryKey: ['members-all'] })
    },
  })
  const createInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('project_invites').insert({ project_id: projectId }).select().single()
      if (error) throw error
      return data as ProjectInvite
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', projectId] }),
  })
  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_invites').update({ revoked: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', projectId] }),
  })
  const addByEmail = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('add_member_by_email', { pid: projectId, member_email: email })
      if (error) throw error
      return (data as string | null) ?? null
    },
    onSuccess: (username) => {
      if (!username) return
      qc.invalidateQueries({ queryKey: ['members', projectId] })
      qc.invalidateQueries({ queryKey: ['members-all'] })
    },
  })
  return { addMember, removeMember, createInvite, revokeInvite, addByEmail }
}

export function inviteMailto(email: string, projectName: string, link: string, inviter?: string) {
  const subject = `Join ${projectName} on Delta`
  const body = `Hi!\n\n${inviter ? `${inviter} invited` : "You've been invited"} you to ${projectName} on Delta, where we track every change on our workbench.\n\nJoin here (you can sign up from the link): ${link}\n\nThe link works for 7 days.`
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`
}
