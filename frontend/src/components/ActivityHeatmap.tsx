import { addDays, differenceInCalendarWeeks, endOfYear, format, startOfDay, startOfWeek, startOfYear, subDays, subMonths, subYears } from 'date-fns'
import { useMemo, useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** Delta launched in 2026, so the year tabs start there. */
const FIRST_YEAR = 2026
const GAP = 3
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

type Range = 'year' | '3months' | 'month' | 'week'

const RANGES: Record<Range, { label: string; period: string; cell: number }> = {
  year: { label: 'Last year', period: 'in the last year', cell: 10 },
  '3months': { label: 'Last 3 months', period: 'in the last 3 months', cell: 18 },
  month: { label: 'Last month', period: 'in the last month', cell: 26 },
  week: { label: 'Last week', period: 'in the last week', cell: 52 },
}

/** Either a rolling range picked from the dropdown, or a calendar year picked from the tabs. */
type View = { kind: 'range'; range: Range } | { kind: 'year'; year: number }

function rangeStart(range: Range, today: Date): Date {
  if (range === 'year') return addDays(subYears(today, 1), 1)
  if (range === '3months') return addDays(subMonths(today, 3), 1)
  if (range === 'month') return addDays(subMonths(today, 1), 1)
  return subDays(today, 6)
}

function level(count: number, max: number): number {
  if (count === 0) return 0
  if (max <= 4) return Math.min(4, count)
  const r = count / max
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}

const changesText = (n: number) => `${n === 0 ? 'No' : n} change${n === 1 ? '' : 's'}`

/** Contribution graph of changes per day. Pick a rolling period from the dropdown or a calendar year from the tabs. Hidden changes are excluded. */
export function ActivityHeatmap({
  commits,
  title = 'Activity',
  summary,
}: {
  commits: { captured_at: string; is_hidden?: boolean }[]
  title?: string
  /** One-line summary; receives the number of changes shown and the period, e.g. "in 2026" or "in the last month". */
  summary?: (total: number, period: string) => string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [currentYear] = useState(() => new Date().getFullYear())
  const [view, setView] = useState<View>({ kind: 'year', year: currentYear })

  // Every year from launch (or the oldest change, if earlier) up to now, newest first.
  const years = useMemo(() => {
    let first = Math.min(FIRST_YEAR, currentYear)
    for (const c of commits) first = Math.min(first, new Date(c.captured_at).getFullYear())
    const out: number[] = []
    for (let y = currentYear; y >= first; y--) out.push(y)
    return out
  }, [commits, currentYear])

  const cell = view.kind === 'year' ? 10 : RANGES[view.range].cell
  const period = view.kind === 'year' ? `in ${view.year}` : RANGES[view.range].period

  const { weeks, days, max, total, monthLabels } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of commits) {
      if (c.is_hidden) continue
      const k = format(new Date(c.captured_at), 'yyyy-MM-dd')
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const today = startOfDay(new Date())
    const first = view.kind === 'year' ? startOfYear(new Date(view.year, 0, 1)) : rangeStart(view.range, today)
    const last = view.kind === 'year' ? endOfYear(first) : today
    const gridStart = startOfWeek(first) // Sunday on or before the first day
    const nWeeks = differenceInCalendarWeeks(last, first) + 1

    // "blank" = outside the period or still in the future: drawn as empty space.
    const weeks: { date: Date; count: number; blank: boolean }[][] = []
    let max = 0
    let total = 0
    for (let w = 0; w < nWeeks; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d)
        const count = counts.get(format(date, 'yyyy-MM-dd')) ?? 0
        const blank = date > today || date < first || date > last
        if (!blank) {
          max = Math.max(max, count)
          total += count
        }
        col.push({ date, count, blank })
      }
      weeks.push(col)
    }

    // Label each month above the week that contains its 1st day (and the starting month at the left edge).
    const monthLabels: { week: number; label: string }[] = []
    for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const week = Math.max(0, differenceInCalendarWeeks(m, first))
      const prev = monthLabels[monthLabels.length - 1]
      if (prev && week - prev.week < 3) {
        // Too close to the previous label: keep the later, fuller month.
        if (prev.week === 0 && m > first) monthLabels.pop()
        else continue
      }
      monthLabels.push({ week, label: format(m, 'MMM') })
    }

    // The 7 days, oldest first, for the "Last week" view.
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(first, i)
      return { date, count: counts.get(format(date, 'yyyy-MM-dd')) ?? 0 }
    })
    return { weeks, days, max, total, monthLabels }
  }, [commits, view])

  const width = weeks.length * (cell + GAP)
  const showTip = (e: React.MouseEvent<HTMLElement>, text: string) => {
    if (!wrapRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = wrapRef.current.getBoundingClientRect()
    setTip({ x: r.left - p.left + r.width / 2, y: r.top - p.top, text })
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg">{title}</h2>
          <p className="text-sm text-muted-foreground">{summary ? summary(total, period) : `${total} change${total === 1 ? '' : 's'} ${period}`}</p>
        </div>
        <Select
          value={view.kind === 'range' ? view.range : ''}
          onValueChange={(v) => {
            setTip(null)
            setView({ kind: 'range', range: v as Range })
          }}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Time period">
            <SelectValue placeholder={view.kind === 'year' ? `All of ${view.year}` : 'Time period'} />
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <SelectItem key={r} value={r}>
                {RANGES[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start">
        <div className="relative min-w-0 flex-1" ref={wrapRef} onMouseLeave={() => setTip(null)}>
          {view.kind === 'range' && view.range === 'week' ? (
            <ol className="grid grid-cols-7 gap-2" aria-label="Changes per day in the last week">
              {days.map((d) => {
                const text = `${changesText(d.count)} on ${format(d.date, 'EEEE, MMM d')}`
                return (
                  <li key={d.date.toISOString()} className="flex flex-col items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{format(d.date, 'EEE')}</span>
                    <span
                      className={cn('flex aspect-square w-full max-w-[64px] items-center justify-center rounded-xl font-mono text-sm font-semibold', level(d.count, max) >= 3 ? 'text-white' : 'text-foreground')}
                      style={{ backgroundColor: `var(--heat-${level(d.count, max)})` }}
                      aria-label={text}
                      onMouseEnter={(e) => showTip(e, text)}
                    >
                      {d.count > 0 ? d.count : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">{format(d.date, 'MMM d')}</span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="overflow-x-auto pb-1">
              <div className="flex" style={{ minWidth: width + 32 }}>
                <div className="mr-1.5 shrink-0 pt-[18px] text-[10px] leading-none text-muted-foreground" style={{ width: 26 }}>
                  {DAY_LABELS.map((d, i) => (
                    <div key={i} style={{ height: cell, marginBottom: GAP }} className="flex items-center">
                      {d}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="relative mb-1.5 h-3 text-[10px] leading-none text-muted-foreground" style={{ width }}>
                    {monthLabels.map((m) => (
                      <span key={`${m.label}-${m.week}`} className="absolute" style={{ left: m.week * (cell + GAP) }}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                  <div className="flex" style={{ gap: GAP }} role="grid" aria-label="Activity heatmap">
                    {weeks.map((col, w) => (
                      <div key={w} className="flex flex-col" style={{ gap: GAP }} role="row">
                        {col.map((c) => {
                          const text = `${changesText(c.count)} on ${format(c.date, 'MMM d, yyyy')}`
                          return (
                            <div
                              key={c.date.toISOString()}
                              role="gridcell"
                              aria-label={c.blank ? undefined : text}
                              className={cell >= 18 ? 'rounded-[5px]' : 'rounded-[3px]'}
                              style={{
                                width: cell,
                                height: cell,
                                backgroundColor: c.blank ? 'transparent' : `var(--heat-${level(c.count, max)})`,
                              }}
                              onMouseEnter={(e) => !c.blank && showTip(e, text)}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {tip && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-full bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow-md"
              style={{ left: tip.x, top: tip.y - 6 }}
              role="tooltip"
            >
              {tip.text}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5 sm:w-20 sm:flex-col" role="tablist" aria-label="Year">
          {years.map((y) => {
            const on = view.kind === 'year' && view.year === y
            return (
              <button
                key={y}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTip(null)
                  setView({ kind: 'year', year: y })
                }}
                className={cn(
                  'h-8 rounded-full px-4 text-left font-mono text-sm font-medium transition-colors',
                  on ? 'bg-brand text-white shadow-sm shadow-brand/25' : 'text-muted-foreground hover:bg-subtle hover:text-foreground',
                )}
              >
                {y}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="inline-block size-2.5 rounded-[3px]" style={{ backgroundColor: `var(--heat-${l})` }} />
        ))}
        More
      </div>
    </div>
  )
}
