import type { Box } from './types'

export function center(box: Box): { cx: number; cy: number } {
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2 }
}

/** Plain location words from a 3x3 grid over the image, e.g. "top left", "center", "bottom right". */
export function describeRegion(box: Box): string {
  const { cx, cy } = center(box)
  const col = cx < 1 / 3 ? 'left' : cx < 2 / 3 ? 'center' : 'right'
  const row = cy < 1 / 3 ? 'top' : cy < 2 / 3 ? 'middle' : 'bottom'
  if (row === 'middle' && col === 'center') return 'center'
  if (row === 'middle') return `middle ${col}`
  if (col === 'center') return `${row} center`
  return `${row} ${col}`
}
