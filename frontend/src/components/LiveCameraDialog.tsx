import { Video } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Project } from '@/lib/types'

export function LiveCameraDialog({ project, base, trigger }: { project: Project; base: string; trigger?: ReactNode }) {
  const [failed, setFailed] = useState(false)
  return (
    <Dialog onOpenChange={() => setFailed(false)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Video /> Live camera
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[min(1000px,calc(100%-2rem))] sm:max-w-[min(1000px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            Live camera
            {project.live_stream_url && !failed && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-broken px-2.5 py-0.5 text-xs font-semibold text-white">
                <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </span>
            )}
          </DialogTitle>
          <DialogDescription>What the camera above your bench sees right now.</DialogDescription>
        </DialogHeader>
        {project.live_stream_url && !failed ? (
          <img src={project.live_stream_url} alt="Live camera view of the workbench" className="w-full rounded-xl bg-black" onError={() => setFailed(true)} />
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
            {failed ? "Couldn't reach the camera. Is it on the same Wi-Fi as this computer?" : 'No live camera is set up yet.'}{' '}
            <Link to={`${base}/settings`} className="font-medium text-brand-text underline underline-offset-2">
              Add the camera link in settings
            </Link>
            .
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
