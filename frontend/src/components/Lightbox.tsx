import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FrameImage } from './FrameImage'

export interface LightboxItem {
  url?: string
  label: string
}

export function Lightbox({
  items,
  index,
  onIndex,
  open,
  onOpenChange,
  playing,
  onPlayingChange,
  fps = 4,
}: {
  items: LightboxItem[]
  index: number
  onIndex: (i: number) => void
  open: boolean
  onOpenChange: (o: boolean) => void
  playing: boolean
  onPlayingChange: (p: boolean) => void
  fps?: number
}) {
  const n = items.length
  const go = (d: number) => onIndex((index + d + n) % n)

  useEffect(() => {
    if (!open || !playing || n < 2) return
    const t = window.setInterval(() => onIndex(-1), 1000 / fps)
    return () => window.clearInterval(t)
  }, [open, playing, n, fps, onIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === ' ') {
        e.preventDefault()
        onPlayingChange(!playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const item = items[index]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1100px,calc(100%-2rem))] gap-3 p-5 sm:max-w-[min(1100px,calc(100%-2rem))]">
        <DialogTitle className="flex items-center gap-2 text-base">
          {item?.label}
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {index + 1} / {n}
          </span>
        </DialogTitle>
        <DialogDescription className="sr-only">Photo viewer. Use the arrow keys to step through photos and space to play.</DialogDescription>
        <div className="overflow-hidden rounded-xl">
          <FrameImage url={item?.url} alt={item?.label ?? 'Frame'} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => go(-1)} aria-label="Previous photo">
            <ChevronLeft /> Prev
          </Button>
          <div className="flex gap-1" aria-hidden>
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={() => onIndex(i)}
                className={`h-1.5 w-6 rounded-full ${i === index ? 'bg-brand' : 'bg-border'}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onPlayingChange(!playing)} aria-label={playing ? 'Pause' : 'Play the photos like a flipbook'}>
              {playing ? <Pause /> : <Play />} {playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => go(1)} aria-label="Next photo">
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
