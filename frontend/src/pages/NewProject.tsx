import { useQueryClient } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useMyProfile } from '@/hooks/useProfiles'
import { slugify } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { Page } from './ProjectLayout'

const DEFAULT_README = (name: string) => `# ${name}

What is this build, what parts does it use, and how is it wired? Write it here so the whole team knows.

## Parts
- [ ] Microcontroller
- [ ] Motors
- [ ] Power

## Notes
Delta saves every change on the bench automatically.
`

export function NewProject() {
  const { user } = useAuth()
  const profile = useMyProfile()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const shared = params.get('shared') === '1'
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const slug = slugify(name)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug) return setError('Give your project a name with at least one letter or number.')
    if (!profile) {
      return setError('Your account has no profile yet. Run supabase/schema.sql in the Supabase SQL Editor, then reload this page.')
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('projects').insert({
      owner_id: user!.id,
      name: name.trim(),
      slug,
      description: description.trim() || null,
      readme: DEFAULT_README(name.trim()),
      active_user_id: user!.id,
    })
    setBusy(false)
    if (error) {
      return setError(error.code === '23505' ? `You already have a project with the link "${slug}".` : error.message)
    }
    qc.invalidateQueries({ queryKey: ['projects'] })
    navigate(`/${profile?.username}/${slug}${shared ? '?invite=1' : ''}`)
  }

  return (
    <Page>
      <div className="mx-auto max-w-xl">
        <h1 className="text-[32px] leading-tight">{shared ? 'New shared project' : 'New project'}</h1>
        <p className="mt-2 text-muted-foreground">
          {shared
            ? "A project for your whole team. Create it, and you'll invite people right away."
            : 'A project holds everything about one build: a robot, a lab setup, a bench. You can change the name later.'}
        </p>
        <form onSubmit={submit} className="card rise mt-8 grid gap-6 p-6 md:p-8">
          {error && (
            <div role="alert" className="rounded-xl bg-broken-soft px-4 py-3 text-sm text-broken">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="name">What are you building?</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rover Chassis v2" required autoFocus />
            {slug && profile && (
              <p className="text-xs text-muted-foreground">
                Link: <span className="font-mono text-foreground">/{profile.username}/{slug}</span>
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">
              Short description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Four-wheel rover with differential drive" />
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={busy || !slug}>
            {shared ? <Users /> : <Plus />} {busy ? 'Creating…' : shared ? 'Create and invite people' : 'Create project'}
          </Button>
        </form>
      </div>
    </Page>
  )
}
