import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LinkIcon, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DeltaAppIcon } from '@/components/DeltaLogo'
import { EmptyState } from '@/components/EmptyState'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { isMissingInvitesTable } from '@/hooks/useTeam'
import { supabase } from '@/lib/supabase'
import { Page } from './ProjectLayout'

interface Preview {
  project_name: string
  project_slug: string
  owner_username: string
  invited_by: string | null
  already_member: boolean
}

/** Where invite links land: /join/:token */
export function Join() {
  const { token } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [joining, setJoining] = useState(false)

  const preview = useQuery({
    queryKey: ['invite-preview', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invite_preview', { invite_token: token })
      if (error) throw error
      return ((data as Preview[]) ?? [])[0] ?? null
    },
  })

  if (preview.isLoading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )
  }
  const p = preview.data
  if (!p) {
    return (
      <Page>
        <EmptyState
          icon={LinkIcon}
          title={preview.error && isMissingInvitesTable(preview.error) ? 'Invite links aren’t set up yet' : 'This invite link doesn’t work'}
          action={
            <Button variant="outline" asChild>
              <Link to="/">Go to your projects</Link>
            </Button>
          }
        >
          {preview.error && isMissingInvitesTable(preview.error)
            ? 'The project owner needs to run supabase/migrations/002_invites.sql in Supabase.'
            : 'It may have expired or been turned off. Ask whoever sent it for a new one.'}
        </EmptyState>
      </Page>
    )
  }

  const href = `/${p.owner_username}/${p.project_slug}`
  const join = async () => {
    setJoining(true)
    const { error } = await supabase.rpc('accept_invite', { invite_token: token })
    setJoining(false)
    if (error) return toast.error(error.message)
    await Promise.all([qc.invalidateQueries({ queryKey: ['projects'] }), qc.invalidateQueries({ queryKey: ['members-all'] }), qc.invalidateQueries({ queryKey: ['commits'] })])
    toast.success(`Welcome to ${p.project_name}!`)
    navigate(href, { replace: true })
  }

  return (
    <Page>
      <div className="card rise mx-auto mt-6 max-w-md p-8 text-center md:p-10">
        <DeltaAppIcon size={72} className="mx-auto rounded-[18px] shadow-lg shadow-brand/20" />
        <p className="mt-6 text-muted-foreground">{p.invited_by ? `${p.invited_by} invited you to join` : 'You’ve been invited to join'}</p>
        <h1 className="mt-1 text-3xl">{p.project_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">by {p.owner_username}</p>
        <p className="mt-6 text-[15px] text-muted-foreground">You'll see every change on their bench, can mark what works, save checkpoints and leave comments.</p>
        {p.already_member ? (
          <Button variant="primary" size="lg" className="mt-8 w-full" asChild>
            <Link to={href}>You're already on the team. Open project</Link>
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="mt-8 w-full" onClick={join} disabled={joining}>
            <UserPlus /> {joining ? 'Joining…' : `Join ${p.project_name}`}
          </Button>
        )}
      </div>
    </Page>
  )
}
