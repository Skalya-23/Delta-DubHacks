/**
 * Adds a real-photo change to the demo project: two photos of a breadboard, before and after
 * wiring up both push buttons. Run after the seed (re-seeding deletes it):
 *
 *   npx tsx scripts/add-photo-change.ts you@example.com
 *
 * Uses scripts/demo-photos/bench-before.png and bench-after.png (1448 × 1086).
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { diffObjects } from '../src/lib/diff'
import type { BenchObject } from '../src/lib/types'

config({ path: '.env.local' })
config({ path: '.env' })

const SLUG = 'rover-chassis-v2'
const BUCKET = 'frames'
const W = 1448
const H = 1086
const PHOTOS = new URL('./demo-photos/', import.meta.url)

/** A box from pixel corners (x1, y1) → (x2, y2), normalized to 0..1. */
function obj(id: string, name: string, x1: number, y1: number, x2: number, y2: number): BenchObject {
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { id, name, x: r(x1 / W), y: r(y1 / H), w: r((x2 - x1) / W), h: r((y2 - y1) / H) }
}

// Parts in both photos (they don't move).
const SHARED: BenchObject[] = [
  obj('obj_1', 'Breadboard', 170, 445, 1338, 862),
  obj('obj_2', 'Potted plant', 0, 0, 240, 402),
  obj('obj_3', 'Red wire', 398, 344, 700, 545),
  obj('obj_4', 'Black wire', 664, 318, 1022, 590),
  obj('obj_5', 'Push button', 550, 583, 612, 652),
  obj('obj_6', 'Push button', 864, 548, 922, 607),
  obj('obj_7', 'Blue wire', 598, 616, 902, 668),
]

export const BEFORE: BenchObject[] = SHARED

// Seven jumper wires added to connect both buttons.
export const AFTER: BenchObject[] = [
  ...SHARED,
  obj('obj_8', 'Blue wire', 462, 552, 548, 712),
  obj('obj_9', 'Blue wire', 608, 558, 872, 606),
  obj('obj_10', 'Red wire', 520, 636, 552, 764),
  obj('obj_11', 'Red wire', 922, 588, 980, 698),
  obj('obj_12', 'Yellow wire', 908, 420, 1082, 638),
  obj('obj_13', 'Black wire', 1022, 384, 1150, 472),
  obj('obj_14', 'Black wire', 1062, 600, 1120, 694),
]

const SUMMARY =
  'Seven jumper wires were added to wire up both push buttons: a blue loop and a short red wire on the left button, a second blue wire between the buttons, and a yellow wire, a red wire and two black wires on the right side connecting to the power rails.'

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

async function main() {
  const email = process.argv[2]
  if (!email) die('Usage: npx tsx scripts/add-photo-change.ts you@example.com')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) die('Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  let userId: string | undefined
  for (let page = 1; page <= 50 && !userId; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) die(error.message)
    userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
    if (data.users.length < 200) break
  }
  if (!userId) die(`No user with email ${email}`)
  const { data: project } = await sb.from('projects').select('id').eq('owner_id', userId).eq('slug', SLUG).maybeSingle()
  if (!project) die('Demo project not found. Run the seed first: npx tsx scripts/seed.ts ' + email)

  const changes = diffObjects(BEFORE, AFTER)
  const now = new Date()
  const { data: commit, error } = await sb
    .from('commits')
    .insert({
      project_id: project.id,
      author_id: userId,
      title: 'Wire up both push buttons',
      mk1_summary: SUMMARY,
      objects_before: BEFORE,
      objects_after: AFTER,
      changes,
      processing_state: 'described',
      status: 'untested',
      captured_at: now.toISOString(),
      created_at: now.toISOString(),
    })
    .select('id, seq')
    .single()
  if (error || !commit) die(`Could not save the change: ${error?.message}`)

  const frames = []
  for (const kind of ['before', 'after'] as const) {
    const path = `${project.id}/${commit.id}/${kind}_0.png`
    const bytes = readFileSync(new URL(`bench-${kind}.png`, PHOTOS))
    const up = await sb.storage.from(BUCKET).upload(path, new Blob([bytes], { type: 'image/png' }), { contentType: 'image/png', upsert: true })
    if (up.error) die(`Upload failed for ${kind}: ${up.error.message}`)
    frames.push({ commit_id: commit.id, project_id: project.id, kind, frame_index: 0, storage_path: path, width: W, height: H, captured_at: now.toISOString() })
  }
  const { error: fErr } = await sb.from('frames').insert(frames)
  if (fErr) die(`Could not save the photos: ${fErr.message}`)

  console.log(`✔ Added change #${commit.seq}: "Wire up both push buttons" (${changes.length} parts changed)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => die(e instanceof Error ? e.message : String(e)))
}
