import { useQueryClient } from '@tanstack/react-query'
import { Flag, ImagePlus, Loader2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProjectKeyFrames } from '@/hooks/useCommits'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { commitTitle, timeAgo } from '@/lib/format'
import { FRAMES_BUCKET, supabase } from '@/lib/supabase'
import type { Commit } from '@/lib/types'
import { MomentPicker } from './CommitPicker'
import { FrameImage } from './FrameImage'
import { StatusPill } from './StatusBadge'

const NAME_IDEAS = ['Drives straight', 'Everything works', 'Before rewiring', 'Demo ready']
const MAX_NAME = 60
const THUMB_LIMIT = 60

export function CreateCheckpointDialog({
  projectId,
  commits,
  defaultCommitId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  projectId: string
  commits: Commit[]
  defaultCommitId?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [innerOpen, setInnerOpen] = useState(false)
  const open = controlledOpen ?? innerOpen
  const setOpen = onOpenChange ?? setInnerOpen
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [commitId, setCommitId] = useState<string | undefined>(defaultCommitId)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const chosenId = commitId ?? defaultCommitId ?? commits[0]?.id
  const chosen = commits.find((c) => c.id === chosenId)

  const keyFrames = useProjectKeyFrames(open ? projectId : undefined)
  const thumbCommits = useMemo(() => {
    const list = commits.slice(0, THUMB_LIMIT)
    return chosen && !list.includes(chosen) ? [...list, chosen] : list
  }, [commits, chosen])
  const urls = useSignedUrls(open ? thumbCommits.map((c) => keyFrames.data?.[c.id]?.after) : [])
  const thumbs: Record<string, string | undefined> = {}
  for (const c of thumbCommits) {
    const p = keyFrames.data?.[c.id]?.after
    thumbs[c.id] = p ? urls.data?.[p] : undefined
  }

  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => (filePreview ? URL.revokeObjectURL(filePreview) : undefined), [filePreview])

  const previewUrl = filePreview ?? (chosen ? thumbs[chosen.id] : undefined)
  const previewLoading = !filePreview && Boolean(chosen) && (keyFrames.isLoading || urls.isLoading)

  const reset = () => {
    setName('')
    setDescription('')
    setFile(null)
    setCommitId(defaultCommitId)
  }

  const changeOpen = (o: boolean) => {
    if (!o) reset()
    setOpen(o)
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Pick an image file (JPG or PNG).')
    if (f.size > 10 * 1024 * 1024) return toast.error('That photo is over 10 MB. Pick a smaller one.')
    setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !chosenId) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('checkpoints')
        .insert({ project_id: projectId, commit_id: chosenId, name: trimmed, description: description.trim() })
        .select()
        .single()
      if (error) {
        throw new Error(error.code === '23505' ? `You already have a checkpoint called "${trimmed}". Pick another name.` : error.message)
      }
      if (file) {
        const path = `${projectId}/checkpoints/${data.id}.jpg`
        const up = await supabase.storage.from(FRAMES_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
        if (up.error) {
          toast.error(`Checkpoint saved, but the photo didn't upload: ${up.error.message}`)
        } else {
          await supabase.from('checkpoints').update({ photo_path: path }).eq('id', data.id)
        }
      }
      qc.invalidateQueries({ queryKey: ['checkpoints', projectId] })
      toast.success(`Checkpoint "${trimmed}" saved`)
      changeOpen(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[92svh] grid-cols-1 gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-3xl">
        <form onSubmit={submit} className="grid min-w-0 grid-cols-1 md:grid-cols-[1fr_1.1fr]">
          <div className="flex min-w-0 flex-col gap-3 bg-subtle p-5 md:rounded-l-[inherit] md:p-6">
            <div className="relative overflow-hidden rounded-xl bg-card shadow-sm max-md:max-h-44">
              <FrameImage url={previewUrl} loading={previewLoading} alt={chosen ? `The bench at change #${chosen.seq}` : 'No change picked'} />
              <span className="absolute top-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white">
                {file ? 'Your photo' : chosen ? `Change #${chosen.seq}` : 'Preview'}
              </span>
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove your photo and use the camera's photo"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {chosen && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={chosen.status} size="sm" />
                  <span className="text-xs text-muted-foreground">{timeAgo(chosen.captured_at)}</span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{commitTitle(chosen)}</p>
                {chosen.status === 'broken' && (
                  <p className="flex items-start gap-1.5 text-xs text-broken">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> This change is marked Broken. Checkpoints are usually moments that work.
                  </p>
                )}
              </div>
            )}
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)} />
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => fileInput.current?.click()}>
              <ImagePlus /> {file ? 'Use a different photo' : 'Use your own photo'}
            </Button>
            {file && <p className="-mt-1 truncate text-xs text-muted-foreground">{file.name}</p>}
          </div>

          <div className="flex min-w-0 flex-col gap-5 p-5 md:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Flag className="size-5 text-brand" aria-hidden /> Save a checkpoint
              </DialogTitle>
              <DialogDescription>Name a moment worth remembering so you can always find it and go back to it.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cp-name">Name</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {name.length}/{MAX_NAME}
                </span>
              </div>
              <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME} placeholder="e.g. Drives straight" required autoFocus />
              {!name && (
                <div className="flex flex-wrap gap-1.5">
                  {NAME_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setName(idea)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!defaultCommitId && (
              <div className="grid min-w-0 gap-2">
                <Label>Which change?</Label>
                <MomentPicker commits={commits} value={chosenId} onChange={setCommitId} label="Change" thumbs={thumbs} />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="cp-desc">
                What works at this point? <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="cp-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Both motors spin, steering is centered…" />
            </div>

            <DialogFooter className="mt-auto">
              <Button type="button" variant="ghost" onClick={() => changeOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving || !name.trim() || !chosenId}>
                {saving ? <Loader2 className="animate-spin" /> : <Flag />}
                {saving ? 'Saving…' : 'Save checkpoint'}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
