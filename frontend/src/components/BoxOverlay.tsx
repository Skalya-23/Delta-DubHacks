import type { Box } from '@/lib/types'
import { cn } from '@/lib/utils'

export type BoxTone = 'added' | 'removed' | 'moved' | 'neutral' | 'ghost'

export interface OverlayBox {
  key: string
  box: Box
  tone: BoxTone
  label?: string
  /** Index into the changes list, used for hover linking. */
  changeIndex?: number
  dashed?: boolean
}

const TONE_COLOR: Record<BoxTone, string> = {
  added: 'var(--added)',
  removed: 'var(--removed)',
  moved: 'var(--moved)',
  neutral: 'rgba(255,255,255,0.55)',
  ghost: 'var(--brand)',
}

const pct = (n: number) => `${Math.max(0, Math.min(1, n)) * 100}%`

/** Boxes positioned with percentages over an image. The parent must be `relative` and match the image size. */
export function BoxOverlay({
  boxes,
  highlighted,
  onHover,
}: {
  boxes: OverlayBox[]
  highlighted?: number | null
  onHover?: (i: number | null) => void
}) {
  const anyHighlighted = highlighted !== null && highlighted !== undefined
  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((b) => {
        const color = TONE_COLOR[b.tone]
        const isHi = anyHighlighted && b.changeIndex === highlighted
        const isDim = anyHighlighted && !isHi && b.tone !== 'neutral'
        const labelBelow = b.box.y < 0.07
        return (
          <div
            key={b.key}
            className={cn(
              'absolute rounded-md transition-all duration-150',
              b.changeIndex !== undefined && onHover && 'pointer-events-auto cursor-default',
              isDim && 'opacity-30',
            )}
            style={{
              left: pct(b.box.x),
              top: pct(b.box.y),
              width: pct(b.box.w),
              height: pct(b.box.h),
              border: `${isHi ? 3 : 2}px ${b.dashed || b.tone === 'ghost' ? 'dashed' : 'solid'} ${color}`,
              backgroundColor: b.tone === 'ghost' ? 'color-mix(in srgb, var(--brand) 14%, transparent)' : isHi ? `color-mix(in srgb, ${color} 22%, transparent)` : undefined,
              boxShadow: isHi ? `0 0 0 3px color-mix(in srgb, ${color} 35%, transparent)` : undefined,
              zIndex: isHi ? 10 : 1,
            }}
            onMouseEnter={() => b.changeIndex !== undefined && onHover?.(b.changeIndex)}
            onMouseLeave={() => onHover?.(null)}
          >
            {b.label && (
              <span
                className={cn(
                  'absolute left-[-2px] max-w-[220%] truncate rounded-full px-1.5 py-px font-sans text-[10px] leading-tight font-semibold whitespace-nowrap',
                  labelBelow ? 'top-full mt-0.5' : 'bottom-full mb-0.5',
                  b.tone === 'neutral' ? 'bg-black/60 text-white' : 'text-white',
                )}
                style={b.tone === 'neutral' ? undefined : { backgroundColor: color, color: b.tone === 'moved' ? '#1C1B19' : '#fff' }}
              >
                {b.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
