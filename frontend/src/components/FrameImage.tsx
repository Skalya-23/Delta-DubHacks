import { ImageOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** An image from a signed URL with a skeleton while loading. Children are overlaid (e.g. boxes). */
export function FrameImage({
  url,
  alt,
  loading,
  className,
  imgClassName,
  children,
}: {
  url?: string | null
  alt: string
  loading?: boolean
  className?: string
  imgClassName?: string
  children?: ReactNode
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!url && !loading) {
    return (
      <div className={cn('flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-subtle text-xs text-muted-foreground', className)}>
        <ImageOff className="size-5" aria-hidden />
        No frame
      </div>
    )
  }
  return (
    <div className={cn('relative overflow-hidden bg-subtle', className)}>
      {(!loaded || !url) && !failed && <Skeleton className="absolute inset-0 rounded-none" />}
      {!url && <div className="aspect-[4/3]" />}
      {url && !failed && (
        <img
          src={url}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('block h-auto w-full select-none', !loaded && 'aspect-[4/3] opacity-0', imgClassName)}
        />
      )}
      {failed && (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
          <ImageOff className="size-5" aria-hidden />
          Image failed to load
        </div>
      )}
      {url && loaded && children}
    </div>
  )
}
