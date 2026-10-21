import { formatDistanceToNowStrict } from 'date-fns'
import { Check, Copy, Link2, Loader2, Mail, Search, UserPlus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useMyProfile, useProfiles } from '@/hooks/useProfiles'
import { useMembers } from '@/hooks/useProject'
import { inviteMailto, inviteUrl, isMissingInvitesTable, useInvites, useTeamMutations } from '@/hooks/useTeam'
import type { Project } from '@/lib/types'
import { UserAvatar } from './UserAvatar'

/** Invite people to a project: by email, by username, or with an invite link. Also shows the current team. */
export function InviteDialog({
  project,
  trigger,
  open,
  onOpenChange,
}: {
  project: Project
  trigger: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="size-5 text-brand" aria-hidden /> Invite people
          </DialogTitle>
          <DialogDescription>Teammates can see every change, mark what works, and comment on {project.name}.</DialogDescription>
        </DialogHeader>
        <InvitePanel project={project} />
      </DialogContent>
    </Dialog>
  )
}

/** The dialog body, also used inline on the settings page. */
export function InvitePanel({ project }: { project: Project }) {
  const { user } = useAuth()
  const isOwner = project.owner_id === user?.id
  const profiles = useProfiles()
  const members = useMembers(project.id)
  const { addMember, removeMember } = useTeamMutations(project.id)
  const [query, setQuery] = useState('')

  const memberIds = new Set((members.data ?? []).map((m) => m.user_id))
  const q = query.trim().replace(/^@/, '').toLowerCase()
  const matches = q
    ? Object.values(profiles.data ?? {})
        .filter((p) => !memberIds.has(p.id) && (p.username.includes(q) || (p.display_name ?? '').toLowerCase().includes(q)))
        .slice(0, 5)
    : []
  const owner = profiles.data?.[project.owner_id]

  return (
    <div className="space-y-6">
      {isOwner ? (
        <>
          <InviteByEmail project={project} />
          <section className="space-y-2.5" aria-labelledby="invite-by-name">
            <h3 id="invite-by-name" className="text-base">
              Add someone who has an account
            </h3>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username…" className="pl-10" aria-label="Search people by username" />
            </div>
            {q && (
              <ul className="space-y-1" aria-label="Matching people">
                {matches.length === 0 ? (
                  <li className="rounded-xl bg-subtle px-4 py-3 text-sm text-muted-foreground">
                    Nobody called "{q}" yet{memberIds.size > 0 && ' who isn’t already on the team'}. Send them an invite link instead.
                  </li>
                ) : (
                  matches.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-subtle">
                      <UserAvatar profile={p} size={30} />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.username}</span>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={addMember.isPending}
                        onClick={() =>
                          addMember.mutate(p.id, {
                            onSuccess: () => {
                              toast.success(`${p.username} joined ${project.name}`)
                              setQuery('')
                            },
                            onError: (e) => toast.error(e.message),
                          })
                        }
                      >
                        Add
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </section>
          <InviteLink projectId={project.id} />
        </>
      ) : (
        <p className="rounded-xl bg-subtle px-4 py-3 text-sm text-muted-foreground">
          Only the project owner{owner ? ` (${owner.username})` : ''} can invite people. Ask them to add your teammate.
        </p>
      )}

      <section className="space-y-2.5" aria-labelledby="team-heading">
        <h3 id="team-heading" className="text-base">
          Team <span className="font-sans text-sm font-normal text-muted-foreground">· {members.data?.length ?? '…'}</span>
        </h3>
        <ul className="space-y-1.5">
          {(members.data ?? [])
            .slice()
            .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
            .map((m) => {
              const p = profiles.data?.[m.user_id]
              return (
                <li key={m.user_id} className="flex items-center gap-3 rounded-xl bg-subtle px-3 py-2">
                  <UserAvatar profile={p} size={28} />
                  <span className="font-medium">{p?.username ?? 'unknown'}</span>
                  {m.user_id === user?.id && <span className="text-sm text-muted-foreground">(you)</span>}
                  <span className="ml-auto rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground">{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                  {isOwner && m.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${p?.username} from the team`}
                      onClick={() => removeMember.mutate(m.user_id, { onSuccess: () => toast.success(`Removed ${p?.username ?? 'them'}`), onError: (e) => toast.error(e.message) })}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              )
            })}
        </ul>
      </section>
    </div>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function InviteByEmail({ project }: { project: Project }) {
  const me = useMyProfile()
  const invites = useInvites(project.id)
  const { addByEmail, createInvite } = useTeamMutations(project.id)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<{ email: string; mailto: string; link: string } | null>(null)
  const busy = addByEmail.isPending || createInvite.isPending
  const valid = EMAIL.test(email.trim())

  const emailLink = async (to: string) => {
    const token = invites.data?.[0]?.token ?? (await createInvite.mutateAsync()).token
    const link = inviteUrl(token)
    const mailto = inviteMailto(to, project.name, link, me?.username)
    setSentTo({ email: to, mailto, link })
    window.location.href = mailto
  }

  const submit = async () => {
    const to = email.trim().toLowerCase()
    if (!EMAIL.test(to) || busy) return
    setSentTo(null)
    try {
      let username: string | null = null
      try {
        username = await addByEmail.mutateAsync(to)
      } catch (e) {
        if (!isMissingFunction(e)) throw e
      }
      if (username) {
        toast.success(`${username} already had an account and joined ${project.name}`)
      } else {
        await emailLink(to)
      }
      setEmail('')
    } catch (e) {
      toast.error(isMissingInvitesTable(e) ? 'Invite links need supabase/migrations/002_invites.sql first.' : (e as Error).message)
    }
  }

  return (
    <section className="space-y-2.5" aria-labelledby="invite-by-email">
      <h3 id="invite-by-email" className="text-base">
        Invite by email
      </h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" className="pl-10" aria-label="Email address" autoComplete="off" />
        </div>
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Mail />} Invite
        </Button>
      </form>
      {sentTo ? (
        <div className="space-y-2 rounded-xl bg-subtle px-4 py-3 text-sm">
          <p>
            <span className="font-medium">{sentTo.email}</span> doesn't have an account yet, so we opened your email app with an invite link. They'll join as soon as they sign up.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a href={sentTo.mailto} className="font-medium text-brand-text underline underline-offset-2">
              Open the email again
            </a>
            <button
              type="button"
              className="font-medium text-brand-text underline underline-offset-2"
              onClick={() => navigator.clipboard?.writeText(sentTo.link).then(() => toast.success('Invite link copied'), () => toast.error("Couldn't copy"))}
            >
              Copy the link instead
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Already on Delta? They're added right away. Otherwise they get an email with an invite link.</p>
      )}
    </section>
  )
}

function isMissingFunction(error: unknown) {
  const e = error as { code?: string; message?: string } | null
  return Boolean(e && (e.code === 'PGRST202' || /add_member_by_email/.test(e.message ?? '')))
}

function InviteLink({ projectId }: { projectId: string }) {
  const invites = useInvites(projectId)
  const { createInvite, revokeInvite } = useTeamMutations(projectId)
  const [copied, setCopied] = useState(false)
  const active = invites.data?.[0]

  const copy = (token: string) =>
    navigator.clipboard?.writeText(inviteUrl(token)).then(
      () => {
        setCopied(true)
        toast.success('Invite link copied. Paste it in a message to your teammate.')
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => toast.error("Couldn't copy. Select the link and copy it by hand."),
    )

  return (
    <section className="space-y-2.5 rounded-2xl border border-border p-4" aria-labelledby="invite-link">
      <h3 id="invite-link" className="flex items-center gap-2 text-base">
        <Link2 className="size-4 text-brand-text" aria-hidden /> Or share an invite link
      </h3>
      <p className="text-sm text-muted-foreground">Works for people without an account too: they sign up, then join automatically.</p>
      {invites.isLoading ? null : invites.error && isMissingInvitesTable(invites.error) ? (
        <p className="rounded-xl bg-subtle px-4 py-3 text-sm text-muted-foreground">
          Invite links need a quick database update. Run <code className="font-mono">supabase/migrations/002_invites.sql</code> in the Supabase SQL Editor, then reload.
        </p>
      ) : active ? (
        <>
          <div className="flex gap-2">
            <Input readOnly value={inviteUrl(active.token)} onFocus={(e) => e.target.select()} className="font-mono text-xs" aria-label="Invite link" />
            <Button variant="primary" onClick={() => copy(active.token)}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Expires in {formatDistanceToNowStrict(new Date(active.expires_at))}</span>
            <button
              type="button"
              className="font-medium hover:text-broken hover:underline"
              onClick={() => revokeInvite.mutate(active.id, { onSuccess: () => toast.success('Link turned off. Nobody new can join with it.') })}
            >
              Turn off this link
            </button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          disabled={createInvite.isPending}
          onClick={() =>
            createInvite.mutate(undefined, {
              onSuccess: (inv) => copy(inv.token),
              onError: (e) => toast.error(isMissingInvitesTable(e) ? 'Run supabase/migrations/002_invites.sql first.' : e.message),
            })
          }
        >
          <Link2 /> {createInvite.isPending ? 'Creating…' : 'Create and copy a link'}
        </Button>
      )}
    </section>
  )
}
