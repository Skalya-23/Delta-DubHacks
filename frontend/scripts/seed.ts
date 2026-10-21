/**
 * Delta demo seed: creates "Rover Chassis v2" for an existing user with ~25 changes, photos, checkpoints, notes and comments.
 *
 *   npx tsx scripts/seed.ts you@example.com
 *
 * Reads VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY from .env.local / .env.
 * Safe to re-run: deletes the seeded project (and its stored frames) first.
 */
import { pathToFileURL } from 'node:url'
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describeRegion, diffObjects } from '../src/lib/diff'
import type { BenchObject, Box, Change } from '../src/lib/types'

config({ path: '.env.local' })
config({ path: '.env' })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
const BUCKET = 'frames'
const SLUG = 'rover-chassis-v2'
const W = 640
const H = 480

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Deterministic randomness so every run looks the same
// ---------------------------------------------------------------------------
let rngState = 42
function rand() {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296
  return rngState / 4294967296
}

// ---------------------------------------------------------------------------
// Bench objects
// ---------------------------------------------------------------------------
type Kind = 'Arduino board' | 'Breadboard' | 'DC motor' | 'Battery pack' | 'Red wire' | 'Blue wire' | 'Servo'

const SIZES: Record<Kind, { w: number; h: number }> = {
  'Arduino board': { w: 0.17, h: 0.15 },
  Breadboard: { w: 0.26, h: 0.15 },
  'DC motor': { w: 0.1, h: 0.1 },
  'Battery pack': { w: 0.15, h: 0.12 },
  'Red wire': { w: 0.13, h: 0.05 },
  'Blue wire': { w: 0.13, h: 0.05 },
  Servo: { w: 0.09, h: 0.08 },
}

let nextObjId = 1
function make(name: Kind, x: number, y: number): BenchObject {
  return { id: `obj_${nextObjId++}`, name, x, y, ...SIZES[name] }
}

type Op =
  | { op: 'add'; name: Kind; x: number; y: number }
  | { op: 'remove'; name: Kind; nth?: number }
  | { op: 'move'; name: Kind; x: number; y: number; nth?: number }

export interface Step {
  ops: Op[]
  summary?: string
  title?: string
  status?: 'untested' | 'working' | 'broken'
  hidden?: boolean
  noise?: 'shadow' | 'hand'
  description?: string
  notes?: string[]
  daysAgo: number
}

export function applyOps(state: BenchObject[], ops: Op[]): BenchObject[] {
  let next = state.map((o) => ({ ...o }))
  for (const op of ops) {
    const matches = next.filter((o) => o.name === op.name)
    if (op.op === 'add') next.push(make(op.name, op.x, op.y))
    if (op.op === 'remove') {
      const target = matches[op.nth ?? 0]
      next = next.filter((o) => o !== target)
    }
    if (op.op === 'move') {
      const target = matches[op.nth ?? 0]
      if (target) Object.assign(target, { x: op.x, y: op.y })
    }
  }
  return next
}

function summarize(changes: Change[]): string {
  const parts = changes.map((c) => {
    if (c.type === 'added') return `a ${c.name.toLowerCase()} was added at the ${describeRegion(c.to!)}`
    if (c.type === 'removed') return `the ${c.name.toLowerCase()} was removed from the ${describeRegion(c.from!)}`
    return `the ${c.name.toLowerCase()} was moved from the ${describeRegion(c.from!)} to the ${describeRegion(c.to!)}`
  })
  const s = parts.join(', and ')
  return s ? s[0].toUpperCase() + s.slice(1) + '.' : 'No objects changed on the bench.'
}

// ---------------------------------------------------------------------------
// The story of the rover build
// ---------------------------------------------------------------------------
export const INITIAL: BenchObject[] = [make('Breadboard', 0.6, 0.62), make('Battery pack', 0.08, 0.7)]

export const STEPS: Step[] = [
  { daysAgo: 34, ops: [{ op: 'add', name: 'Arduino board', x: 0.4, y: 0.36 }], summary: 'An Arduino board was placed in the center of the bench, next to the breadboard.', title: 'Bring in the Arduino', status: 'working' },
  { daysAgo: 34, ops: [{ op: 'add', name: 'DC motor', x: 0.1, y: 0.12 }], summary: 'A DC motor was added in the top left corner of the bench.', status: 'untested' },
  { daysAgo: 33, ops: [{ op: 'add', name: 'Red wire', x: 0.26, y: 0.66 }], summary: 'A red wire was laid between the battery pack and the breadboard, likely for power.', title: 'Wire up battery power', status: 'working', description: 'Battery **+** goes to the breadboard power rail. Checked 7.4 V with the multimeter.' },
  { daysAgo: 33, ops: [{ op: 'add', name: 'Blue wire', x: 0.42, y: 0.56 }], summary: 'A blue wire was added connecting the Arduino board to the breadboard.', status: 'working', notes: ['Signal wire from pin 9 to the motor driver input.'] },
  { daysAgo: 31, ops: [{ op: 'move', name: 'DC motor', x: 0.3, y: 0.12 }], summary: 'The DC motor was moved to the right along the top of the bench, closer to the Arduino board.', status: 'broken', description: 'Moved the motor to shorten the leads. Now it **stalls** on startup. 😬', notes: ['Stall current is ~2 A, the driver is rated for 1.2 A. That is probably it.', 'Try the bigger driver board tomorrow.'] },
  { daysAgo: 31, ops: [], noise: 'shadow', hidden: true, summary: 'No objects changed. A shadow passed across the left half of the bench.' },
  { daysAgo: 29, ops: [{ op: 'move', name: 'Battery pack', x: 0.08, y: 0.45 }], summary: 'The battery pack was moved up along the left edge of the bench.', status: 'working' },
  { daysAgo: 27, ops: [{ op: 'add', name: 'Servo', x: 0.78, y: 0.12 }], summary: 'A servo was added in the top right corner of the bench.', title: 'Add steering servo', status: 'working' },
  { daysAgo: 26, ops: [{ op: 'move', name: 'Red wire', x: 0.2, y: 0.52 }], summary: 'The red wire was moved up so it runs from the battery pack toward the Arduino board.', status: 'untested' },
  { daysAgo: 24, ops: [{ op: 'remove', name: 'Blue wire' }], summary: 'The blue wire between the Arduino board and the breadboard was removed.', status: 'broken', notes: ['Pulled this to debug, rover stopped responding. Expected.'] },
  { daysAgo: 24, ops: [{ op: 'add', name: 'Blue wire', x: 0.56, y: 0.42 }], summary: 'A blue wire was added on the right side of the Arduino board, running toward the breadboard.', title: 'Rewire signal to pin 10', status: 'working', description: 'Moved the PWM signal to **pin 10** so the servo can use pin 9.\n\n- [x] Motor spins\n- [x] Servo sweeps\n- [ ] Encoder' },
  { daysAgo: 20, ops: [{ op: 'move', name: 'Arduino board', x: 0.36, y: 0.3 }], summary: 'The Arduino board was nudged up and to the left.', status: 'working' },
  { daysAgo: 20, ops: [], noise: 'hand', hidden: true, summary: 'No objects changed. A hand reached into the frame near the center and then left.' },
  { daysAgo: 17, ops: [{ op: 'move', name: 'Servo', x: 0.8, y: 0.34 }], summary: 'The servo was moved down along the right edge of the bench.', status: 'untested' },
  { daysAgo: 15, ops: [{ op: 'remove', name: 'DC motor' }], summary: 'The DC motor was removed from the top of the bench.', title: 'Pull motor for rework', status: 'broken' },
  { daysAgo: 14, ops: [{ op: 'add', name: 'DC motor', x: 0.18, y: 0.14 }], summary: 'A DC motor was placed back near the top left of the bench, slightly right of its original spot.', title: 'Remount drive motor with new driver', status: 'working', description: 'Swapped to the **TB6612** driver. No more stalls, motor pulls 1.1 A peak.', notes: ['Confirmed: drives straight for 3 m on the hallway test.'] },
  { daysAgo: 12, ops: [{ op: 'move', name: 'Breadboard', x: 0.64, y: 0.66 }], summary: 'The breadboard was shifted slightly down and to the right.', status: 'working' },
  { daysAgo: 10, ops: [{ op: 'add', name: 'DC motor', x: 0.74, y: 0.84 }], summary: 'A second DC motor was added in the bottom right corner of the bench.', title: 'Add second drive motor', status: 'untested' },
  { daysAgo: 8, ops: [{ op: 'move', name: 'Red wire', x: 0.24, y: 0.78 }, { op: 'move', name: 'Blue wire', x: 0.54, y: 0.86 }], summary: 'Both wires were rerouted: the red wire moved down toward the bottom left and the blue wire moved down toward the second motor.', status: 'broken', notes: ['Left motor spins backwards. Swap the leads?'] },
  { daysAgo: 7, ops: [{ op: 'move', name: 'Servo', x: 0.82, y: 0.18 }], summary: 'The servo was moved back up toward the top right corner.', status: 'working' },
  { daysAgo: 5, ops: [{ op: 'remove', name: 'Battery pack' }], summary: 'The battery pack was removed from the left side of the bench.', status: 'untested' },
  { daysAgo: 5, ops: [{ op: 'add', name: 'Battery pack', x: 0.06, y: 0.62 }], summary: 'A battery pack was placed back on the left side of the bench, lower than before.', title: 'Swap in charged battery', status: 'working' },
  { daysAgo: 3, ops: [{ op: 'move', name: 'Arduino board', x: 0.42, y: 0.34 }, { op: 'move', name: 'Breadboard', x: 0.58, y: 0.6 }], summary: 'The Arduino board and the breadboard were both moved closer together near the center.', status: 'working', description: 'Tightened the layout so it fits on the **chassis plate**.' },
  { daysAgo: 1, ops: [{ op: 'move', name: 'DC motor', nth: 1, x: 0.78, y: 0.7 }], summary: 'The second DC motor was moved up from the bottom right corner.', status: 'broken', notes: ['Encoder cable got pinched in the new spot.'] },
]

// A final change that is still being analyzed by Mk1.
export const PENDING_STEP: Step = { daysAgo: 0, ops: [{ op: 'move', name: 'Servo', x: 0.66, y: 0.14 }] }

// ---------------------------------------------------------------------------
// SVG frames
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function drawObject(o: BenchObject, opacity = 1): string {
  const x = o.x * W
  const y = o.y * H
  const w = o.w * W
  const h = o.h * H
  const cx = x + w / 2
  const cy = y + h / 2
  let body = ''
  switch (o.name as Kind) {
    case 'Arduino board': {
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#00878f" stroke="#005c61" stroke-width="2"/>`
      for (let i = 0; i < 10; i++) body += `<rect x="${x + 8 + i * ((w - 16) / 10)}" y="${y + 4}" width="5" height="5" fill="#1b1b1b"/>`
      body += `<rect x="${x + 6}" y="${y + h - 22}" width="20" height="16" fill="#c0c0c0" rx="2"/>`
      body += `<rect x="${cx - 12}" y="${cy - 8}" width="24" height="16" fill="#1b1b1b" rx="1"/>`
      break
    }
    case 'Breadboard': {
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#f3efe4" stroke="#cfc8b4" stroke-width="2"/>`
      body += `<line x1="${x + 6}" y1="${y + 7}" x2="${x + w - 6}" y2="${y + 7}" stroke="#d94545" stroke-width="1.5"/>`
      body += `<line x1="${x + 6}" y1="${y + h - 7}" x2="${x + w - 6}" y2="${y + h - 7}" stroke="#3b6fd9" stroke-width="1.5"/>`
      for (let r = 0; r < 5; r++) for (let c = 0; c < 22; c++) body += `<circle cx="${x + 10 + c * ((w - 20) / 21)}" cy="${y + 16 + r * ((h - 32) / 4)}" r="1.3" fill="#8c8672"/>`
      break
    }
    case 'DC motor': {
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2.5}" fill="#9aa3ab" stroke="#5f6870" stroke-width="2"/>`
      body += `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) / 4}" fill="#cfd6dc" stroke="#5f6870" stroke-width="2"/>`
      body += `<circle cx="${cx}" cy="${cy}" r="3" fill="#2b2f33"/>`
      break
    }
    case 'Battery pack': {
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#26292e" stroke="#0e0f11" stroke-width="2"/>`
      body += `<rect x="${x + 6}" y="${y + 6}" width="${w / 2 - 9}" height="${h - 12}" rx="3" fill="#3a8f3e"/><rect x="${cx + 3}" y="${y + 6}" width="${w / 2 - 9}" height="${h - 12}" rx="3" fill="#3a8f3e"/>`
      body += `<text x="${x + 10}" y="${y + 18}" font-size="11" font-weight="700" fill="#fff">+</text>`
      break
    }
    case 'Red wire':
    case 'Blue wire': {
      const color = o.name === 'Red wire' ? '#e5484d' : '#3e8bff'
      body = `<path d="M ${x + 3} ${y + h * 0.75} C ${x + w * 0.35} ${y - h * 0.2}, ${x + w * 0.65} ${y + h * 1.2}, ${x + w - 3} ${y + h * 0.25}" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>`
      body += `<rect x="${x}" y="${y + h * 0.75 - 3}" width="6" height="6" fill="#d9d9d9"/><rect x="${x + w - 6}" y="${y + h * 0.25 - 3}" width="6" height="6" fill="#d9d9d9"/>`
      break
    }
    case 'Servo': {
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1f5fd1" stroke="#123c86" stroke-width="2"/>`
      body += `<circle cx="${x + w * 0.32}" cy="${cy}" r="${h / 4}" fill="#f5f5f5"/><rect x="${x + w * 0.32 - 3}" y="${y - 6}" width="6" height="${h / 2 + 6}" rx="3" fill="#f5f5f5"/>`
      break
    }
  }
  const label = `<text x="${cx}" y="${y + h + 13}" text-anchor="middle" font-size="11" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600" fill="#e8f5ec" stroke="#0f2e20" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`
  return `<g opacity="${opacity}">${body}${label}</g>`
}

function hand(cx: number, cy: number): string {
  const x = cx * W
  const y = cy * H
  return `<g opacity="0.9"><ellipse cx="${x + 30}" cy="${y + 40}" rx="34" ry="26" fill="#d9a77f"/><rect x="${x + 40}" y="${y + 40}" width="140" height="44" rx="20" fill="#c99470" transform="rotate(25 ${x + 40} ${y + 40})"/>${[0, 1, 2, 3]
    .map((i) => `<rect x="${x + 2 + i * 13}" y="${y + 5}" width="11" height="30" rx="5.5" fill="#e0b18c"/>`)
    .join('')}</g>`
}

function renderFrame(objects: { o: BenchObject; opacity?: number }[], opts: { stamp: string; extra?: string; shadow?: boolean }): string {
  let grid = ''
  for (let gx = 0; gx <= W; gx += 20) grid += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="#2f6b4f" stroke-width="${gx % 100 === 0 ? 1.4 : 0.6}"/>`
  for (let gy = 0; gy <= H; gy += 20) grid += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#2f6b4f" stroke-width="${gy % 100 === 0 ? 1.4 : 0.6}"/>`
  let rulers = ''
  for (let gx = 100; gx < W; gx += 100) rulers += `<text x="${gx + 3}" y="12" font-size="9" fill="#6fae8e" font-family="monospace">${gx / 10}</text>`
  for (let gy = 100; gy < H; gy += 100) rulers += `<text x="3" y="${gy - 3}" font-size="9" fill="#6fae8e" font-family="monospace">${gy / 10}</text>`
  const shadow = opts.shadow
    ? `<defs><radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${W * 0.28}" cy="${H * 0.5}" rx="220" ry="260" fill="url(#sh)"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#1f5a40"/>
${grid}${rulers}
${objects.map(({ o, opacity }) => drawObject(o, opacity)).join('\n')}
${shadow}${opts.extra ?? ''}
<rect x="${W - 196}" y="${H - 24}" width="190" height="18" rx="3" fill="#000" opacity="0.55"/>
<text x="${W - 190}" y="${H - 11}" font-size="11" fill="#9fe0b8" font-family="monospace">${esc(opts.stamp)}</text>
<circle cx="${W - 14}" cy="14" r="5" fill="#ff4d4f"/>
</svg>`
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpBox = (a: Box, b: Box, t: number): Box => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) })

/** before, sequence frames (object partway along its path, a hand doing the work), after */
export function buildFrames(before: BenchObject[], after: BenchObject[], changes: Change[], seq: number, when: Date, noise?: Step['noise']) {
  const stamp = (offsetSec: number) => `CAM1 #${seq} ${new Date(when.getTime() + offsetSec * 1000).toISOString().slice(0, 19).replace('T', ' ')}`
  const nSeq = 2 + (seq % 2) // 2 or 3 sequence frames
  const frames: { kind: 'before' | 'after' | 'sequence'; index: number; svg: string }[] = []
  frames.push({ kind: 'before', index: 0, svg: renderFrame(before.map((o) => ({ o })), { stamp: stamp(-6) }) })

  const moved = changes.find((c) => c.type !== 'removed') ?? changes[0]
  for (let i = 0; i < nSeq; i++) {
    const t = (i + 1) / (nSeq + 1)
    const objs: { o: BenchObject; opacity?: number }[] = []
    for (const o of before) {
      const ch = changes.find((c) => c.from && c.from.x === o.x && c.from.y === o.y && c.name === o.name)
      if (!ch) objs.push({ o })
      else if (ch.type === 'moved') objs.push({ o: { ...o, ...lerpBox(ch.from!, ch.to!, t) } })
      else objs.push({ o, opacity: 1 - t })
    }
    for (const c of changes.filter((c) => c.type === 'added')) {
      const a = after.find((o) => o.name === c.name && o.x === c.to!.x && o.y === c.to!.y)
      if (a) objs.push({ o: a, opacity: t })
    }
    let extra = ''
    if (noise === 'hand') extra = hand(0.42, lerp(0.9, 0.35, Math.sin(Math.PI * t)))
    else if (moved) {
      const box = moved.type === 'moved' ? lerpBox(moved.from!, moved.to!, t) : (moved.to ?? moved.from)!
      extra = hand(box.x + box.w * 0.3, box.y + box.h * 0.2)
    }
    frames.push({ kind: 'sequence', index: i, svg: renderFrame(objs, { stamp: stamp(-6 + (i + 1) * 1.5), extra, shadow: noise === 'shadow' && i === Math.floor(nSeq / 2) }) })
  }
  frames.push({ kind: 'after', index: 0, svg: renderFrame(after.map((o) => ({ o })), { stamp: stamp(0) }) })
  return frames
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
async function findUserByEmail(sb: SupabaseClient, email: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) die(`Could not list users: ${error.message}`)
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) return u
    if (data.users.length < 200) break
  }
  return null
}

async function removeFolder(sb: SupabaseClient, prefix: string) {
  const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 })
  const files: string[] = []
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`
    if (item.id === null) await removeFolder(sb, path)
    else files.push(path)
  }
  for (let i = 0; i < files.length; i += 100) await sb.storage.from(BUCKET).remove(files.slice(i, i + 100))
}

async function inBatches<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn))
}

export const README = `# Rover Chassis v2

A four-wheel differential-drive rover built on an **Arduino Uno**, two **DC gear motors**, and a **steering servo**.
Every change on the bench is saved by the Delta camera and described by the AI (Perceptron Mk1).

## Parts list

| Part | Qty | Notes |
| --- | --- | --- |
| Arduino Uno R3 | 1 | Main controller |
| DC gear motor (6 V) | 2 | Drive wheels |
| SG90 servo | 1 | Steering |
| TB6612FNG motor driver | 1 | Replaced the L298N (stall issue, see change #5) |
| 2S Li-ion battery pack | 1 | 7.4 V |
| Half-size breadboard | 1 | Power rails + signal |

## Status

- [x] Power rail wired
- [x] Single motor drives straight
- [x] Steering servo sweeps
- [ ] Second motor direction fixed
- [ ] Encoder feedback

## Something broke?

Open **Checkpoints**, find **Drives straight**, and press **Go back to this**. Delta gives you a step-by-step checklist of what to move.
`

export const DOCS = [
  {
    title: 'Wiring guide',
    body: `# Wiring guide

## Power
1. Battery **+** → breadboard red rail (red wire)
2. Battery **−** → breadboard blue rail
3. Breadboard rail → Arduino \`VIN\` and \`GND\`

## Signals
| Arduino pin | Goes to | Wire |
| --- | --- | --- |
| D10 | TB6612 PWMA | Blue |
| D9 | Servo signal | Orange |
| D7 / D8 | TB6612 AIN1 / AIN2 | Yellow |

> ⚠️ Never power the servo from the Arduino 5 V pin. It browns out the board.
`,
  },
  {
    title: 'Calibration & testing',
    body: `# Calibration & testing

## Drive-straight test
1. Place the rover at the start of the hallway tape.
2. Run \`drive_test.ino\` at 60% PWM.
3. Measure drift after 3 m. **Pass:** less than 10 cm.

## Servo centering
\`\`\`cpp
servo.write(90); // adjust trim until wheels are straight
\`\`\`

## Known issues
- Second motor spins backwards (swap leads or invert in code)
- Encoder cable gets pinched near the right wheel well
`,
  },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const email = process.argv[2]
  if (!email) die('Usage: npx tsx scripts/seed.ts you@example.com')
  if (!SUPABASE_URL || !SECRET) die('Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local')

  const sb = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log(`→ Looking up ${email}…`)
  const user = await findUserByEmail(sb, email)
  if (!user) die(`No user with email ${email}. Sign up in the app first.`)
  const { data: profile } = await sb.from('profiles').select('username').eq('id', user.id).maybeSingle()
  if (!profile) die('That user has no profile row. Did you run supabase/schema.sql before signing up?')

  // Re-run safety
  const { data: existing } = await sb.from('projects').select('id').eq('owner_id', user.id).eq('slug', SLUG).maybeSingle()
  if (existing) {
    console.log('→ Deleting the previous seeded project…')
    await removeFolder(sb, existing.id)
    const { error } = await sb.from('projects').delete().eq('id', existing.id)
    if (error) die(`Could not delete old project: ${error.message}`)
  }

  console.log('→ Creating project "Rover Chassis v2"…')
  const { data: project, error: pErr } = await sb
    .from('projects')
    .insert({
      owner_id: user.id,
      name: 'Rover Chassis v2',
      slug: SLUG,
      description: 'Four-wheel differential-drive rover: Arduino, two DC motors, steering servo.',
      readme: README,
      active_user_id: user.id,
      created_at: new Date(Date.now() - 36 * 86400_000).toISOString(),
    })
    .select()
    .single()
  if (pErr || !project) die(`Could not create project: ${pErr?.message}`)

  // Walk through the build story
  let state = INITIAL
  const all = [...STEPS.map((s) => ({ ...s, pending: false })), { ...PENDING_STEP, pending: true }]
  const commitIds: string[] = []
  let lastTime = 0
  let uploaded = 0

  for (let i = 0; i < all.length; i++) {
    const step = all[i]
    const before = state
    const after = applyOps(state, step.ops)
    state = after
    const changes = diffObjects(before, after)
    const seq = i + 1

    // Spread commits through the day; keep them strictly increasing.
    let when: Date
    if (step.pending) when = new Date(Date.now() - 90_000)
    else {
      const d = new Date()
      d.setDate(d.getDate() - step.daysAgo)
      d.setHours(10 + Math.floor(rand() * 9), Math.floor(rand() * 60), Math.floor(rand() * 60), 0)
      when = d
    }
    if (when.getTime() <= lastTime) when = new Date(lastTime + (20 + Math.floor(rand() * 90)) * 60_000)
    if (when.getTime() > Date.now() - 60_000 && !step.pending) when = new Date(Date.now() - 30 * 60_000)
    lastTime = when.getTime()

    const row = step.pending
      ? { project_id: project.id, author_id: user.id, processing_state: 'pending', captured_at: when.toISOString(), created_at: when.toISOString() }
      : {
          project_id: project.id,
          author_id: user.id,
          title: step.title ?? null,
          mk1_summary: step.summary ?? summarize(changes),
          objects_before: before,
          objects_after: after,
          changes,
          processing_state: 'described',
          status: step.status ?? 'untested',
          is_hidden: step.hidden ?? false,
          user_description: step.description ?? '',
          captured_at: when.toISOString(),
          created_at: when.toISOString(),
        }
    const { data: commit, error: cErr } = await sb.from('commits').insert(row).select('id, seq').single()
    if (cErr || !commit) die(`Could not save change #${seq}: ${cErr?.message}`)
    commitIds.push(commit.id)

    const frames = buildFrames(before, after, changes, commit.seq, when, step.noise)
    const frameRows = frames.map((f) => ({
      commit_id: commit.id,
      project_id: project.id,
      kind: f.kind,
      frame_index: f.index,
      storage_path: `${project.id}/${commit.id}/${f.kind}_${f.index}.svg`,
      width: W,
      height: H,
      captured_at: when.toISOString(),
    }))
    await inBatches(frames, 6, async (f) => {
      const path = `${project.id}/${commit.id}/${f.kind}_${f.index}.svg`
      const { error } = await sb.storage.from(BUCKET).upload(path, new Blob([f.svg], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml', upsert: true })
      if (error) die(`Upload failed for ${path}: ${error.message}`)
      uploaded++
    })
    const { error: fErr } = await sb.from('frames').insert(frameRows)
    if (fErr) die(`Could not insert frames: ${fErr.message}`)

    if (step.notes?.length) {
      const notes = step.notes.map((body, k) => ({
        commit_id: commit.id,
        project_id: project.id,
        author_id: user.id,
        body,
        created_at: new Date(when.getTime() + (k + 1) * 25 * 60_000).toISOString(),
      }))
      const { error } = await sb.from('commit_notes').insert(notes)
      if (error) die(`Could not insert notes: ${error.message}`)
    }
    process.stdout.write(`\r→ Changes: ${seq}/${all.length}  photos uploaded: ${uploaded}`)
  }
  console.log()

  console.log('→ Creating checkpoints and notes…')
  const cp = (seq: number, name: string, description: string) => ({
    project_id: project.id,
    commit_id: commitIds[seq - 1],
    name,
    description,
    created_by: user.id,
    created_at: new Date(new Date().getTime() - (all.length - seq) * 3600_000).toISOString(),
  })
  const { error: cpErr } = await sb.from('checkpoints').insert([
    cp(4, 'First wiring done', 'Everything is **wired and powered**. Motor not tested yet.'),
    cp(11, 'Steering works', 'The steering servo sweeps 0–180°. Signal moved to pin 10.'),
    cp(16, 'Drives straight', 'Drives straight for 3 m with the TB6612 driver. 🎉 **Go back to this if anything breaks.**'),
  ])
  if (cpErr) die(`Could not insert checkpoints: ${cpErr.message}`)

  const { error: dErr } = await sb.from('project_docs').insert(DOCS.map((d) => ({ ...d, project_id: project.id, updated_by: user.id })))
  if (dErr) die(`Could not insert docs: ${dErr.message}`)

  console.log(`\n✔ Done! Open /${profile.username}/${SLUG}`)
  console.log('  (Change #25 is left waiting for the AI. To watch it finish live, run:')
  console.log(`   npx tsx scripts/seed.ts --complete-pending ${email}     or finish it from the Jetson script.)\n`)
}

/** Demo helper: finish the pending commit so the UI fills in live over realtime. */
async function completePending(email: string) {
  if (!SUPABASE_URL || !SECRET) die('Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local')
  const sb = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } })
  const user = await findUserByEmail(sb, email)
  if (!user) die(`No user with email ${email}`)
  const { data: project } = await sb.from('projects').select('id').eq('owner_id', user.id).eq('slug', SLUG).maybeSingle()
  if (!project) die('Seeded project not found. Run the seed first.')
  const { data: pending } = await sb.from('commits').select('*').eq('project_id', project.id).eq('processing_state', 'pending').order('seq', { ascending: false }).limit(1).maybeSingle()
  if (!pending) die('No pending commit to complete.')
  const { data: prev } = await sb.from('commits').select('objects_after').eq('project_id', project.id).lt('seq', pending.seq).order('seq', { ascending: false }).limit(1).single()
  const before = (prev?.objects_after ?? []) as BenchObject[]
  const after = applyOps(before, PENDING_STEP.ops)
  const changes = diffObjects(before, after)
  const { error } = await sb
    .from('commits')
    .update({ mk1_summary: 'The servo was moved left along the top of the bench, toward the Arduino board.', objects_before: before, objects_after: after, changes, processing_state: 'described' })
    .eq('id', pending.id)
  if (error) die(error.message)
  console.log(`✔ Change #${pending.seq} now has its AI description.`)
}

/** Offline helper: write every frame as an .svg file to a folder, no Supabase needed. */
async function preview(dir: string) {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true })
  let state = INITIAL
  const all = [...STEPS, PENDING_STEP]
  all.forEach((step, i) => {
    const after = applyOps(state, step.ops)
    const changes = diffObjects(state, after)
    for (const f of buildFrames(state, after, changes, i + 1, new Date(), step.noise)) {
      writeFileSync(`${dir}/${String(i + 1).padStart(2, '0')}_${f.kind}_${f.index}.svg`, f.svg)
    }
    console.log(`#${i + 1}: ${changes.map((c) => `${c.type} ${c.name} (${c.detail})`).join('; ') || 'no changes'}`)
    state = after
  })
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (!isCli) {
  // Imported as a module: don't run anything.
} else if (process.argv[2] === '--preview') {
  preview(process.argv[3] ?? 'seed-preview')
} else if (process.argv[2] === '--complete-pending') {
  completePending(process.argv[3] ?? die('Usage: npx tsx scripts/seed.ts --complete-pending you@example.com'))
} else {
  main().catch((e) => die(e instanceof Error ? e.message : String(e)))
}
