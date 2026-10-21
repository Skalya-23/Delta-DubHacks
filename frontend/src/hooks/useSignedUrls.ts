import { useQuery } from '@tanstack/react-query'
import { signPaths } from '@/lib/signedUrls'

/** Signed URLs for a set of storage paths, cached ~50 minutes (they expire after 60). */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort()
  return useQuery({
    queryKey: ['signed', clean],
    queryFn: () => signPaths(clean),
    enabled: clean.length > 0,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
  })
}
