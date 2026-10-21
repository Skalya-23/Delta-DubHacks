import { useQueryClient } from '@tanstack/react-query'
import { Camera, Flag, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CreateCheckpointDialog } from '@/components/CreateCheckpointDialog'
import { EmptyState } from '@/components/EmptyState'
import { FrameImage } from '@/components/FrameImage'
import { Markdown } from '@/components/Markdown'
import { ListSkeleton } from '@/components/PageSkeleton'
import { StatusPill } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useProjectCommits, useProjectKeyFrames } from '@/hooks/useCommits'
import { useProfiles } from '@/hooks/useProfiles'
import { useCheckpoints } from '@/hooks/useProjectData'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { commitTitle, dayLabel, exactTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Checkpoint } from '@/lib/types'

export function Checkpoints() {
  const { project, base } = useProjectCtx()
  const qc = useQueryClient()
  const checkpoints = useCheckpoints(project.id)
  const commits = useProjectCommits(project.id)
  const keyFrames = useProjectKeyFrames(project.id)
  const profiles = useProfiles()
  const urls = useSignedUrls((checkpoints.data ?? []).flatMap((cp) => [cp.photo_path, keyFrames.data?.[cp.commit_id]?.after]))
  const pickable = (commits.data ?? []).filter((c) => !c.is_hidden)
  const [toDelete, setToDelete] = useState<Checkpoint | null>(null)

  const remove = async ({ id, name }: Checkpoint) => {
    setToDelete(null)
    const { error } = await supabase.from('checkpoints').delete().eq('id', id)
    if (error) return toast.error(error.message)
    qc.invalidateQueries({ queryKey: ['checkpoints', project.id] })
    toast.success(`Removed checkpoint "${name}"`)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight">Checkpoints</h1>
          <p className="mt-1.5 max-w-xl text-muted-foreground">Named moments worth remembering, like "drives straight". You can always go back to one.</p>
        </div>
        {pickable.length > 0 && (
          <CreateCheckpointDialog
            projectId={project.id}
            commits={pickable}
            trigger={
              <Button variant="primary" size="lg">
                <Plus /> Save a checkpoint
              </Button>
            }
          />
        )}
      </div>

      {checkpoints.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !checkpoints.data?.length ? (
        <EmptyState icon={Flag} title="No checkpoints yet">
          When your build reaches a good moment (it drives straight, the arm lifts), save a checkpoint so you can always get back to it.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {checkpoints.data.map((cp, i) => {
            const commit = commits.data?.find((c) => c.id === cp.commit_id)
            const thumb = cp.photo_path ?? keyFrames.data?.[cp.commit_id]?.after
            const creator = cp.created_by ? profiles.data?.[cp.created_by] : undefined
            return (
              <li key={cp.id} className="card rise overflow-hidden" style={{ animationDelay: `${i * 50}ms` }}>
                <Link to={commit ? `${base}/change/${commit.id}` : base} className="relative block bg-subtle">
                  <FrameImage url={thumb ? urls.data?.[thumb] : undefined} loading={Boolean(thumb) && urls.isLoading} alt={`Photo for checkpoint ${cp.name}`} />
                  {cp.photo_path && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                      <Camera className="size-3.5" aria-hidden /> Photo
                    </span>
                  )}
                </Link>
                <div className="space-y-3 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Flag className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-xl">{cp.name}</h2>
                      <p className="text-sm text-muted-foreground" title={exactTime(cp.created_at)}>
                        Saved {dayLabel(cp.created_at)}
                        {creator && <> by {creator.username}</>}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove checkpoint ${cp.name}`} onClick={() => setToDelete(cp)}>
                      <Trash2 />
                    </Button>
                  </div>
                  {cp.description?.trim() && <Markdown className="text-[15px]">{cp.description}</Markdown>}
                  {commit && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
                      <span className="font-mono text-brand-text">#{commit.seq}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{commitTitle(commit)}</span>
                      <StatusPill status={commit.status} size="sm" />
                    </div>
                  )}
                  {commit && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`${base}/go-back/${commit.id}`}>Go back to this</Link>
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove "{toDelete?.name}"?</DialogTitle>
            <DialogDescription>Only the checkpoint label is removed. The change stays on your timeline.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => toDelete && remove(toDelete)}>
              <Trash2 /> Remove checkpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
