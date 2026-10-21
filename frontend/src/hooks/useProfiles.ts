import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import { useAuth } from './useAuth'

/** All profiles, keyed by id. Small at hackathon scale, and lets us show any author cheaply. */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*')
      if (error) throw error
      const map: Record<string, Profile> = {}
      for (const p of data as Profile[]) map[p.id] = p
      return map
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useMyProfile() {
  const { user } = useAuth()
  const profiles = useProfiles()
  return user ? profiles.data?.[user.id] : undefined
}
