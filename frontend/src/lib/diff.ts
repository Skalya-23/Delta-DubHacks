import { center, describeRegion } from './regions'
import type { BenchObject, Box, Change } from './types'

export { describeRegion }

/** Max center distance (normalized) for matching two objects that don't share a name. */
const MATCH_DISTANCE = 0.15
/** Min center movement (normalized) to count as moved. */
const MOVE_DISTANCE = 0.03
/** Min relative change in width or height to count as moved. */
const SIZE_CHANGE = 0.25

function toBox(o: Box): Box {
  return { x: o.x, y: o.y, w: o.w, h: o.h }
}

function distance(a: Box, b: Box): number {
  const ca = center(a)
  const cb = center(b)
  return Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy)
}

function sizeChanged(a: Box, b: Box): boolean {
  const rel = (p: number, q: number) => (p === 0 ? q !== 0 : Math.abs(q - p) / p > SIZE_CHANGE)
  return rel(a.w, b.w) || rel(a.h, b.h)
}

/** Plain-words direction of a move using the dominant axis, e.g. "Moved right", "Moved up and left". */
export function describeMove(from: Box, to: Box): string {
  const a = center(from)
  const b = center(to)
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const horiz = dx > 0 ? 'right' : 'left'
  const vert = dy > 0 ? 'down' : 'up'
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < MOVE_DISTANCE && ay < MOVE_DISTANCE) return 'Resized'
  // Mention the secondary axis only when it is a meaningful part of the move.
  if (ax >= ay) {
    return ay > ax * 0.5 && ay >= MOVE_DISTANCE ? `Moved ${vert} and ${horiz}` : `Moved ${horiz}`
  }
  return ax > ay * 0.5 && ax >= MOVE_DISTANCE ? `Moved ${vert} and ${horiz}` : `Moved ${vert}`
}

/**
 * Diff two object lists into a list of changes.
 * 1. Match by name (case-insensitive); with duplicate names, the closest same-name pair wins.
 * 2. Remaining objects are matched to the nearest unmatched object by center distance (< 0.15).
 * 3. Matched pairs are "moved" if the center moved > 0.03 or width/height changed > 25%.
 * 4. Unmatched before = removed, unmatched after = added.
 */
export function diffObjects(before: BenchObject[], after: BenchObject[]): Change[] {
  const usedB = new Set<number>()
  const usedA = new Set<number>()
  const pairs: [number, number][] = []

  const key = (o: BenchObject) => o.name.trim().toLowerCase()

  // Pass 1: same-name candidates, greedily closest first.
  const named: { i: number; j: number; d: number }[] = []
  before.forEach((b, i) =>
    after.forEach((a, j) => {
      if (key(b) === key(a)) named.push({ i, j, d: distance(b, a) })
    }),
  )
  named.sort((p, q) => p.d - q.d)
  for (const { i, j } of named) {
    if (usedB.has(i) || usedA.has(j)) continue
    usedB.add(i)
    usedA.add(j)
    pairs.push([i, j])
  }

  // Pass 2: leftover objects matched by proximity.
  const near: { i: number; j: number; d: number }[] = []
  before.forEach((b, i) => {
    if (usedB.has(i)) return
    after.forEach((a, j) => {
      if (usedA.has(j)) return
      const d = distance(b, a)
      if (d < MATCH_DISTANCE) near.push({ i, j, d })
    })
  })
  near.sort((p, q) => p.d - q.d)
  for (const { i, j } of near) {
    if (usedB.has(i) || usedA.has(j)) continue
    usedB.add(i)
    usedA.add(j)
    pairs.push([i, j])
  }

  const changes: Change[] = []
  for (const [i, j] of pairs) {
    const b = before[i]
    const a = after[j]
    if (distance(b, a) > MOVE_DISTANCE || sizeChanged(b, a)) {
      changes.push({ type: 'moved', name: a.name, from: toBox(b), to: toBox(a), detail: describeMove(b, a) })
    }
  }
  before.forEach((b, i) => {
    if (!usedB.has(i)) {
      changes.push({ type: 'removed', name: b.name, from: toBox(b), to: null, detail: `Removed from the ${describeRegion(b)}` })
    }
  })
  after.forEach((a, j) => {
    if (!usedA.has(j)) {
      changes.push({ type: 'added', name: a.name, from: null, to: toBox(a), detail: `Added at the ${describeRegion(a)}` })
    }
  })
  return changes
}

export function countChanges(changes: Change[] | null | undefined) {
  const c = { added: 0, removed: 0, moved: 0 }
  for (const ch of changes ?? []) c[ch.type]++
  return c
}
