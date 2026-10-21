import { Play } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Frame } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FrameImage } from './FrameImage'
import { Lightbox, type LightboxItem } from './Lightbox'

export function frameLabel(f: Frame): string {
  if (f.kind === 'before') return 'Before'
  if (f.kind === 'after') return 'After'
  return `In between ${f.frame_index + 1}`
}

export function FrameStrip({ frames, urls, loading }: { frames: Frame[]; urls: Record<string, string>; loading?: boolean }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const items: LightboxItem[] = frames.map((f) => ({ url: urls[f.storage_path], label: frameLabel(f) }))

  // -1 means "advance one" (used by the flipbook timer).
  const onIndex = useCallback(
    (i: number) => setIndex((cur) => (i === -1 ? (cur + 1) % Math.max(1, frames.length) : i)),
    [frames.length],
  )

  if (loading) {
    return (
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-[4/3] w-36 rounded-xl" />
        ))}
      </div>
    )
  }
  if (frames.length === 0) return <p className="text-muted-foreground">No photos were uploaded for this change.</p>

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {frames.length} photos from this change. Click one to enlarge, or press Play.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setIndex(0)
            setPlaying(true)
            setOpen(true)
          }}
        >
          <Play /> Play
        </Button>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {frames.map((f, i) => (
          <li key={f.id} className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setIndex(i)
                setPlaying(false)
                setOpen(true)
              }}
              className={cn(
                'block w-36 overflow-hidden rounded-xl border-2 border-transparent bg-card text-left transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label={`Open ${frameLabel(f)}`}
            >
              <FrameImage url={urls[f.storage_path]} loading={!urls[f.storage_path]} alt={frameLabel(f)} />
              <span
                className={cn(
                  'block px-2 py-1 text-xs font-medium',
                  (f.kind === 'before' || f.kind === 'after') && 'text-foreground',
                  f.kind === 'sequence' && 'text-muted-foreground',
                )}
              >
                {frameLabel(f)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <Lightbox
        items={items}
        index={index}
        onIndex={onIndex}
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setPlaying(false)
        }}
        playing={playing}
        onPlayingChange={setPlaying}
      />
    </div>
  )
}
