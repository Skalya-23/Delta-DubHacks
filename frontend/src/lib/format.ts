import { format, formatDistanceToNowStrict } from 'date-fns'
import type { Commit } from './types'

/** First 7 hex chars of the uuid without dashes, like a git short hash. */
export function shortHash(id: string): string {
  return id.replace(/-/g, '').slice(0, 7)
}

const VERB = { added: 'added', removed: 'removed', moved: 'moved' } as const

/** A short title: the person's title, else built from the changes ("DC motor moved"), else the AI sentence. */
export function commitTitle(c: Pick<Commit, 'title' | 'mk1_summary'> & { changes?: Commit['changes'] }): string {
  if (c.title?.trim()) return c.title.trim()
  const changes = c.changes ?? []
  if (changes.length > 0) {
    const first = `${changes[0].name} ${VERB[changes[0].type]}`
    if (changes.length === 1) return first
    if (changes.length === 2) return `${first}, ${changes[1].name} ${VERB[changes[1].type]}`
    return `${first} and ${changes.length - 1} more`
  }
  return c.mk1_summary?.trim() || 'Untitled change'
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true })
}

export function exactTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy, h:mm a')
}

export function dayLabel(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

/** Strip characters that would break a PostgREST `or=(...)` filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\]/g, ' ').trim()
}
