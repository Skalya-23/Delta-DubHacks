import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, FileText, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Markdown } from '@/components/Markdown'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProfiles } from '@/hooks/useProfiles'
import { useUpdateProject } from '@/hooks/useProject'
import { useDocs } from '@/hooks/useProjectData'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { timeAgo } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const ABOUT = 'about'

/** The project notebook: "About this project" (the project README) plus any number of pages. */
export function Notes() {
  const { project } = useProjectCtx()
  const qc = useQueryClient()
  const docs = useDocs(project.id)
  const profiles = useProfiles()
  const updateProject = useUpdateProject(project)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const list = docs.data ?? []
  const selectedId = params.get('page') ?? ABOUT
  const doc = list.find((d) => d.id === selectedId)
  const isAbout = !doc
  const title = isAbout ? 'About this project' : doc.title
  const body = isAbout ? (project.readme ?? '') : (doc.body ?? '')
  const invalidate = () => qc.invalidateQueries({ queryKey: ['docs', project.id] })
  const select = (id: string) => {
    setEditing(false)
    setParams(id === ABOUT ? {} : { page: id }, { replace: true })
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const { data, error } = await supabase
      .from('project_docs')
      .insert({ project_id: project.id, title: newTitle.trim(), body: `# ${newTitle.trim()}\n\n` })
      .select()
      .single()
    if (error) return toast.error(error.message)
    await invalidate()
    setNewOpen(false)
    setNewTitle('')
    select(data.id)
    setEditing(true)
  }

  const save = async (value: string) => {
    setSaving(true)
    if (isAbout) {
      updateProject.mutate(
        { readme: value },
        {
          onSuccess: () => {
            setEditing(false)
            toast.success('Saved')
          },
          onError: (e) => toast.error(e.message),
          onSettled: () => setSaving(false),
        },
      )
      return
    }
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('project_docs').update({ body: value, updated_by: u.user?.id }).eq('id', doc.id)
    setSaving(false)
    if (error) return toast.error(error.message)
    await invalidate()
    setEditing(false)
    toast.success('Saved')
  }

  const remove = async () => {
    if (!doc) return
    const { error } = await supabase.from('project_docs').delete().eq('id', doc.id)
    if (error) return toast.error(error.message)
    setDeleteOpen(false)
    select(ABOUT)
    await invalidate()
    toast.success(`Deleted "${doc.title}"`)
  }

  if (docs.isLoading) return <PageSkeleton />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] leading-tight">Documentation</h1>
        <p className="mt-1.5 text-muted-foreground">Everything about this build: wiring, parts lists, test steps, lessons learned.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[230px_1fr]">
        <aside className="space-y-3">
          <nav className="card p-2" aria-label="Notebook pages">
            {[{ id: ABOUT, title: 'About this project', icon: BookOpen }, ...list.map((d) => ({ id: d.id, title: d.title, icon: FileText }))].map((pg) => (
              <button
                key={pg.id}
                type="button"
                onClick={() => select(pg.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors',
                  selectedId === pg.id || (pg.id === ABOUT && isAbout) ? 'bg-brand-soft font-semibold text-brand-text' : 'text-muted-foreground hover:bg-subtle hover:text-foreground',
                )}
                aria-current={selectedId === pg.id ? 'page' : undefined}
              >
                <pg.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{pg.title}</span>
              </button>
            ))}
          </nav>
          <Button variant="outline" className="w-full" onClick={() => setNewOpen(true)}>
            <Plus /> New page
          </Button>
        </aside>

        <article className="card min-w-0 p-6 md:p-10">
          <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
            <h2 className="mr-auto text-2xl">{title}</h2>
            {!isAbout && (
              <span className="text-sm text-muted-foreground">
                Edited {timeAgo(doc.updated_at)}
                {doc.updated_by && profiles.data?.[doc.updated_by] && <> by {profiles.data[doc.updated_by].username}</>}
              </span>
            )}
            {!editing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
                {!isAbout && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteOpen(true)} aria-label="Delete page">
                    <Trash2 />
                  </Button>
                )}
              </>
            )}
          </div>
          {editing ? (
            <MarkdownEditor key={selectedId} initial={body} minRows={20} autoFocus saving={saving} onCancel={() => setEditing(false)} onSave={save} />
          ) : body.trim() ? (
            <Markdown className="max-w-[70ch] text-[16px]">{body}</Markdown>
          ) : (
            <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
              <NotebookPen className="mb-3 size-8" aria-hidden />
              <p>This page is empty.</p>
              <Button variant="primary" size="sm" className="mt-4" onClick={() => setEditing(true)}>
                Start writing
              </Button>
            </div>
          )}
        </article>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <form onSubmit={create} className="grid gap-5">
            <DialogHeader>
              <DialogTitle className="text-xl">New page</DialogTitle>
              <DialogDescription>Give it a title. You'll write the rest next.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Wiring guide" autoFocus required />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!newTitle.trim()}>
                Create page
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{doc?.title}"?</DialogTitle>
            <DialogDescription>This deletes the page for everyone. It can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              <Trash2 /> Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
