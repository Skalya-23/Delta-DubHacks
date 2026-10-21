import { cn } from '@/lib/utils'

// Logo artwork lives in public/images/ (originals + transparent versions cut from them).
const MARK_SRC = '/images/delta-mark.png' // orange triangle, transparent background (372 × 309)
const WORDMARK_SRC = '/images/delta-wordmark-text.png' // "DELTA" lettering, used as a mask so it follows the text color
const MARK_RATIO = 372 / 309
const WORDMARK_RATIO = 850 / 155

const SIZES = {
  sm: { mark: 28, text: 15, gap: 'gap-2.5' },
  md: { mark: 38, text: 20, gap: 'gap-3' },
  lg: { mark: 60, text: 32, gap: 'gap-4' },
} as const

/** The Δ mark on its own. `size` is its height in pixels. */
export function DeltaIcon({ size = 26, className }: { size?: number; className?: string }) {
  return <img src={MARK_SRC} alt="" aria-hidden width={Math.round(size * MARK_RATIO)} height={size} className={cn('shrink-0 select-none', className)} draggable={false} />
}

/** The app icon (rounded square). `tone` picks the dark or white version. */
export function DeltaAppIcon({ size = 64, tone = 'dark', className }: { size?: number; tone?: 'dark' | 'light'; className?: string }) {
  return (
    <img
      src={`/images/delta-icon-${tone}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  )
}

/** Mark + "DELTA" wordmark. The lettering takes the current text color, so it works in light and dark mode. */
export function DeltaLogo({
  variant = 'full',
  size = 'sm',
  className,
}: {
  variant?: 'full' | 'icon'
  size?: keyof typeof SIZES
  className?: string
}) {
  const s = SIZES[size]
  if (variant === 'icon') return <DeltaIcon size={s.mark} className={className} />
  return (
    <span className={cn('inline-flex items-center text-foreground', s.gap, className)} role="img" aria-label="Delta">
      <DeltaIcon size={s.mark} />
      <span
        aria-hidden
        className="block bg-current"
        style={{
          height: s.text,
          width: Math.round(s.text * WORDMARK_RATIO),
          WebkitMask: `url(${WORDMARK_SRC}) center / contain no-repeat`,
          mask: `url(${WORDMARK_SRC}) center / contain no-repeat`,
        }}
      />
    </span>
  )
}
