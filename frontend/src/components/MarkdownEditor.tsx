import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Markdown } from './Markdown'

/** Text box with Save. `split` shows a live preview beside it on wide screens; otherwise a Write/Preview toggle. */
export function MarkdownEditor({
  initial,
  onSave,
  onCancel,
  saving,
  saveLabel = 'Save',
  placeholder = 'Write here… (Markdown works: **bold**, - lists, # headings)',
  minRows = 10,
  split = true,
  autoFocus,
  hint = true,
}: {
  initial: string
  onSave: (value: string) => void | Promise<unknown>
  onCancel?: () => void
  saving?: boolean
  saveLabel?: string
  placeholder?: string
  minRows?: number
  split?: boolean
  autoFocus?: boolean
  hint?: boolean
}) {
  const [value, setValue] = useState(initial)
  const [tab, setTab] = useState<'write' | 'preview'>('write')

  const editor = (
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      autoFocus={autoFocus}
      className="min-h-0 resize-y text-[15px] leading-relaxed"
      aria-label="Text editor"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSave(value)
      }}
    />
  )
  const preview = (
    <div className="min-h-24 overflow-auto rounded-xl border border-border bg-subtle/60 p-4" aria-label="Preview">
      {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-muted-foreground">Nothing to preview yet.</p>}
    </div>
  )

  return (
    <div className="space-y-3">
      {!split && (
        <div className="inline-flex rounded-full bg-subtle p-1" role="tablist">
          {(['write', 'preview'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full px-3.5 py-1 text-sm font-medium capitalize',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {split ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {editor}
          <div className="hidden lg:block">{preview}</div>
        </div>
      ) : tab === 'write' ? (
        editor
      ) : (
        preview
      )}
      <div className="flex items-center justify-between gap-2">
        {hint && <span className="hidden text-xs text-muted-foreground sm:inline">Tip: ⌘/Ctrl + Enter saves</span>}
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => onSave(value)} disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
