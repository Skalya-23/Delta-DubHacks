import { useQueryClient } from '@tanstack/react-query'
import { Camera, Copy, HardHat, Pencil, Trash2, Users, Video } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { InvitePanel } from '@/components/InviteDialog'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { useProjectCommits } from '@/hooks/useCommits'
import { useProfiles } from '@/hooks/useProfiles'
import { useMembers, useUpdateProject } from '@/hooks/useProject'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { timeAgo } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function Section({
  title,
  icon: Icon,
  description,
  children,
  danger,
  highlight,
}: {
  title: string
  icon?: typeof Camera
  description?: string
  children: React.ReactNode
  danger?: boolean
  highlight?: boolean
}) {
  return (
    <section className={cn('card rise p-6', danger && 'border-broken/40', highlight && 'border-2 border-brand/40')}>
      <h2 className={cn('flex items-center gap-2.5 text-xl', danger && 'text-broken')}>
        {Icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-full', danger ? 'bg-broken-soft' : 'bg-brand-soft text-brand-text')}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
        )}
        {title}
      </h2>
      {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function copy(text: string, what: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error("Couldn't copy"),
  )
}

export function Settings() {
  const { project, isOwner } = useProjectCtx()
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const update = useUpdateProject(project)
  const profiles = useProfiles()
  const members = useMembers(project.id)
  const commits = useProjectCommits(project.id)

  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [stream, setStream] = useState(project.live_stream_url ?? '')
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const save = (patch: Parameters<typeof update.mutate>[0], msg: string) =>
    update.mutate(patch, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(e.message) })

  const lastReceived = commits.data?.[0]?.created_at ?? commits.data?.[0]?.captured_at
  const snippet = `from push_commit import create_pending_commit
PROJECT_ID = "${project.id}"
create_pending_commit(PROJECT_ID, "before.jpg", "after.jpg")`

  const deleteProject = async () => {
    setDeleting(true)
    // Best-effort cleanup of stored photos before the rows cascade away.
    try {
      const folders = await supabase.storage.from('frames').list(project.id, { limit: 1000 })
      for (const f of folders.data ?? []) {
        const files = await supabase.storage.from('frames').list(`${project.id}/${f.name}`, { limit: 1000 })
        const paths = (files.data ?? []).map((x) => `${project.id}/${f.name}/${x.name}`)
        if (paths.length) await supabase.storage.from('frames').remove(paths)
      }
    } catch {
      // ignore storage cleanup errors
    }
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(false)
    if (error) return toast.error(error.message)
    qc.invalidateQueries({ queryKey: ['projects'] })
    toast.success(`Deleted ${project.name}`)
    navigate('/')
  }

  const memberRows = members.data ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[32px] leading-tight">Project settings</h1>
        <p className="mt-1.5 text-muted-foreground">{project.name}</p>
      </div>

      <Section title="Connect your camera" icon={Camera} description="Your Jetson camera sends changes straight to this project. It needs this project ID." highlight>
        <div className={cn('flex items-center gap-2.5 rounded-xl px-4 py-3', lastReceived ? 'bg-works-soft' : 'bg-subtle')} role="status">
          <span className={cn('size-2.5 rounded-full', lastReceived ? 'bg-works' : 'animate-pulse bg-untested')} aria-hidden />
          <span className={lastReceived ? 'text-works' : 'text-muted-foreground'}>
            {commits.isLoading ? 'Checking…' : lastReceived ? `Connected. Last change received ${timeAgo(lastReceived)}.` : 'Waiting for the first change…'}
          </span>
        </div>
        <div className="grid gap-2">
          <Label>Project ID</Label>
          <div className="flex gap-2">
            <Input readOnly value={project.id} className="font-mono text-sm" onFocus={(e) => e.target.select()} aria-label="Project ID" />
            <Button variant="primary" onClick={() => copy(project.id, 'Project ID')}>
              <Copy /> Copy
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>On the Jetson (Python)</Label>
            <Button variant="ghost" size="xs" onClick={() => copy(snippet, 'Code')}>
              <Copy /> Copy code
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-[#1C1B19] p-4 font-mono text-[13px] leading-relaxed text-[#F2EFEA]">{snippet}</pre>
          <p className="text-sm text-muted-foreground">
            Set <code className="font-mono">SUPABASE_URL</code> and <code className="font-mono">SUPABASE_SECRET_KEY</code> on the Jetson. The data format is in{' '}
            <code className="font-mono">supabase/README.md</code>.
          </p>
        </div>
      </Section>

      <Section title="Name and description" icon={Pencil}>
        <div className="grid gap-2">
          <Label htmlFor="s-name">Project name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">The link stays the same, so shared links keep working.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-desc">Description</Label>
          <Textarea id="s-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button variant="primary" disabled={update.isPending || !name.trim()} onClick={() => save({ name: name.trim(), description: description.trim() || null }, 'Saved')}>
          Save
        </Button>
      </Section>

      <Section title="Live camera link" icon={Video} description="Optional. If your Jetson streams video (MJPEG), paste the link so the team can watch the bench live.">
        <div className="flex gap-2">
          <Input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="http://jetson.local:8080/stream.mjpg" aria-label="Live camera link" className="font-mono text-sm" />
          <Button variant="outline" disabled={update.isPending} onClick={() => save({ live_stream_url: stream.trim() || null }, stream.trim() ? 'Camera link saved' : 'Camera link removed')}>
            Save
          </Button>
        </div>
      </Section>

      <Section title="Who's building" icon={HardHat} description="New changes from the camera get this person's name.">
        <Select value={project.active_user_id ?? 'nobody'} onValueChange={(v) => save({ active_user_id: v === 'nobody' ? null : v }, 'Updated who is building')}>
          <SelectTrigger className="w-full sm:w-80" aria-label="Who's building">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nobody">Nobody right now</SelectItem>
            {memberRows.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                <UserAvatar profile={profiles.data?.[m.user_id]} size={18} />
                {profiles.data?.[m.user_id]?.username ?? m.user_id.slice(0, 8)}
                {m.user_id === user?.id && ' (you)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Team and invites" icon={Users} description="Invite people by username or with a link. Teammates can see every change, mark what works and comment.">
        <InvitePanel project={project} />
      </Section>

      {isOwner && (
        <Section title="Danger zone" icon={Trash2} danger>
          <div className="flex flex-wrap items-center gap-4">
            <div className="mr-auto">
              <p className="font-semibold">Delete this project</p>
              <p className="text-sm text-muted-foreground">Deletes every change, photo, checkpoint, comment and note. There is no undo.</p>
            </div>
            <Dialog onOpenChange={() => setConfirmName('')}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 /> Delete project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-xl">Delete {project.name}?</DialogTitle>
                  <DialogDescription>
                    Everything in this project will be gone for good. Type <span className="font-semibold text-foreground">{project.name}</span> to confirm.
                  </DialogDescription>
                </DialogHeader>
                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Type the project name to confirm" autoFocus />
                <DialogFooter>
                  <Button variant="destructive" className="w-full" disabled={confirmName !== project.name || deleting} onClick={deleteProject}>
                    {deleting ? 'Deleting…' : 'Delete forever'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </Section>
      )}
    </div>
  )
}
