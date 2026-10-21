import { describe, expect, it } from 'vitest'
import { countChanges, describeMove, describeRegion, diffObjects } from './diff'
import type { BenchObject } from './types'

const obj = (id: string, name: string, x: number, y: number, w = 0.1, h = 0.1): BenchObject => ({ id, name, x, y, w, h })

describe('diffObjects', () => {
  it('returns nothing when nothing changed', () => {
    const scene = [obj('1', 'DC motor', 0.1, 0.1), obj('2', 'Servo', 0.6, 0.6)]
    expect(diffObjects(scene, scene)).toEqual([])
  })

  it('ignores jitter below the move threshold', () => {
    const before = [obj('1', 'DC motor', 0.1, 0.1)]
    const after = [obj('1', 'DC motor', 0.11, 0.115)]
    expect(diffObjects(before, after)).toEqual([])
  })

  it('detects a move by name, case-insensitively, with direction', () => {
    const before = [obj('1', 'DC motor', 0.12, 0.3)]
    const after = [obj('9', 'dc MOTOR', 0.45, 0.32)]
    const changes = diffObjects(before, after)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ type: 'moved', name: 'dc MOTOR', detail: 'Moved right' })
    expect(changes[0].from).toEqual({ x: 0.12, y: 0.3, w: 0.1, h: 0.1 })
    expect(changes[0].to).toEqual({ x: 0.45, y: 0.32, w: 0.1, h: 0.1 })
  })

  it('treats a large size change as moved', () => {
    const before = [obj('1', 'Battery pack', 0.4, 0.4, 0.1, 0.1)]
    const after = [obj('1', 'Battery pack', 0.4, 0.4, 0.2, 0.1)]
    expect(diffObjects(before, after)[0].type).toBe('moved')
  })

  it('detects added and removed objects', () => {
    const before = [obj('1', 'DC motor', 0.1, 0.1), obj('2', 'Red wire', 0.8, 0.8)]
    const after = [obj('1', 'DC motor', 0.1, 0.1), obj('3', 'Servo', 0.45, 0.45)]
    const changes = diffObjects(before, after)
    expect(changes.map((c) => c.type).sort()).toEqual(['added', 'removed'])
    const removed = changes.find((c) => c.type === 'removed')!
    expect(removed.name).toBe('Red wire')
    expect(removed.to).toBeNull()
    expect(removed.detail).toBe('Removed from the bottom right')
    const added = changes.find((c) => c.type === 'added')!
    expect(added.from).toBeNull()
    expect(added.detail).toBe('Added at the center')
  })

  it('matches renamed objects by proximity when close enough', () => {
    const before = [obj('1', 'motor', 0.3, 0.3)]
    const after = [obj('1', 'DC motor', 0.35, 0.3)]
    const changes = diffObjects(before, after)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('moved')
  })

  it('does not match differently named objects that are far apart', () => {
    const before = [obj('1', 'motor', 0.1, 0.1)]
    const after = [obj('1', 'DC motor', 0.7, 0.7)]
    expect(countChanges(diffObjects(before, after))).toEqual({ added: 1, removed: 1, moved: 0 })
  })

  it('pairs duplicate names by nearest distance', () => {
    const before = [obj('1', 'Blue wire', 0.1, 0.1), obj('2', 'Blue wire', 0.7, 0.7)]
    const after = [obj('3', 'Blue wire', 0.7, 0.7), obj('4', 'Blue wire', 0.1, 0.4)]
    const changes = diffObjects(before, after)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ type: 'moved', detail: 'Moved down' })
    expect(changes[0].from).toMatchObject({ x: 0.1, y: 0.1 })
  })

  it('handles empty inputs', () => {
    expect(diffObjects([], [])).toEqual([])
    expect(diffObjects([], [obj('1', 'Servo', 0.5, 0.5)])[0].type).toBe('added')
    expect(diffObjects([obj('1', 'Servo', 0.5, 0.5)], [])[0].type).toBe('removed')
  })
})

describe('describeMove', () => {
  const b = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }
  it('uses the dominant axis', () => {
    expect(describeMove(b, { ...b, x: 0.8 })).toBe('Moved right')
    expect(describeMove(b, { ...b, y: 0.1 })).toBe('Moved up')
    expect(describeMove(b, { ...b, x: 0.4, y: 0.8 })).toBe('Moved down')
  })
  it('mentions both axes for diagonal moves', () => {
    expect(describeMove(b, { ...b, x: 0.2, y: 0.2 })).toBe('Moved up and left')
    expect(describeMove(b, { ...b, x: 0.8, y: 0.75 })).toBe('Moved down and right')
  })
})

describe('describeRegion', () => {
  it('names all nine cells', () => {
    const at = (cx: number, cy: number) => describeRegion({ x: cx - 0.05, y: cy - 0.05, w: 0.1, h: 0.1 })
    expect(at(0.1, 0.1)).toBe('top left')
    expect(at(0.5, 0.1)).toBe('top center')
    expect(at(0.9, 0.1)).toBe('top right')
    expect(at(0.1, 0.5)).toBe('middle left')
    expect(at(0.5, 0.5)).toBe('center')
    expect(at(0.9, 0.5)).toBe('middle right')
    expect(at(0.1, 0.9)).toBe('bottom left')
    expect(at(0.5, 0.9)).toBe('bottom center')
    expect(at(0.9, 0.9)).toBe('bottom right')
  })
})
