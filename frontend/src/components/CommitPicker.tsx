import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { commitTitle, timeAgo } from '@/lib/format'
import type { Commit } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FrameImage } from './FrameImage'
import { StatusPill } from './StatusBadge'

/** Pick a moment (a change) from the timeline. Shows a thumbnail, number and time. */
export function MomentPicker({
  commits,
  value,
  onChange,
  label,
  thumbs = {},
}: {
  commits: Commit[]
  value?: string
  onChange: (id: string) => void
  label: string
  /** commit id -> signed thumbnail URL */
  thumbs?: Record<string, string | undefined>
}) {
  const [open, setOpen] = useState(false)
  const selected = commits.find((c) => c.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="card flex w-full min-w-0 items-center gap-3 p-2.5 pr-4 text-left transition-colors hover:border-brand/60 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${label}: choose a change`}
        >
          <div className="w-24 shrink-0 overflow-hidden rounded-lg">
            <FrameImage url={selected ? thumbs[selected.id] : undefined} loading={Boolean(selected) && !thumbs[selected!.id]} alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
            {selected ? (
              <>
                <div className="truncate font-medium">
                  <span className="font-mono text-brand-text">#{selected.seq}</span> {commitTitle(selected)}
                </div>
                <div className="text-sm text-muted-foreground">{timeAgo(selected.captured_at)}</div>
              </>
            ) : (
              <div className="text-muted-foreground">Pick a change</div>
            )}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[max(var(--radix-popover-trigger-width),min(22rem,calc(100vw-2rem)))] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by number or words…" />
          <CommandList>
            <CommandEmpty>No changes found.</CommandEmpty>
            <CommandGroup>
              {commits.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`#${c.seq} ${commitTitle(c)} ${c.id}`}
                  onSelect={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                  className={cn('gap-3', c.id === value && 'bg-brand-soft')}
                >
                  <div className="w-14 shrink-0 overflow-hidden rounded-md">
                    <FrameImage url={thumbs[c.id]} alt="" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-mono text-xs text-brand-text">#{c.seq}</span> {commitTitle(c)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <StatusPill status={c.status} size="sm" />
                      {timeAgo(c.captured_at)}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
