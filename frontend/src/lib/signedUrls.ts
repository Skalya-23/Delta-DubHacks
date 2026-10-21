import { FRAMES_BUCKET, supabase } from './supabase'

export const SIGNED_URL_TTL = 60 * 60 // 1 hour

/** Batch-sign storage paths in the frames bucket. Returns a map of path -> signed URL. */
export async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return {}
  const out: Record<string, string> = {}
  // Keep batches modest so the request body stays small.
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { data, error } = await supabase.storage.from(FRAMES_BUCKET).createSignedUrls(chunk, SIGNED_URL_TTL)
    if (error) throw error
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) out[item.path] = item.signedUrl
    }
  }
  return out
}
