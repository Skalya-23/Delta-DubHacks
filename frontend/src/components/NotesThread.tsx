import { MessagesSquare, MoreHorizontal, SendHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { useNoteMutations, useNotes } from '@/hooks/useProjectData'
import { useProfiles } from '@/hooks/useProfiles'
import { exactTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Markdown } from './Markdown'
import { MarkdownEditor } from './MarkdownEditor'
import { UserAvatar } from './UserAvatar'

/** "Team comments": a simple chat-like thread on one change. */
export function TeamComments({ commitId, projectId }: { commitId: string; projectId: string }) {
  const { user } = useAuth()
  const notes = useNotes(commitId)
  const profiles = useProfiles()
  const { add, edit, remove } = useNoteMutations(commitId, projectId)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const send = () => {
    if (!draft.trim()) return
    add.mutate(draft, {
      onSuccess: () => setDraft(''),
      onError: (e) => toast.error(`Couldn't post your comment: ${e.message}`),
    })
  }

  return (
    <section className="card p-5" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="mb-1 flex items-center gap-2 text-lg">
        <MessagesSquare className="size-5 text-muted-foreground" aria-hidden />
        Team comments
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">Talk about this change with your team: what you tested, what broke, what's next.</p>

      {notes.isLoading && <Skeleton className="h-20 w-full rounded-xl" />}
      {notes.data?.length === 0 && <p className="mb-4 rounded-xl bg-subtle px-4 py-3 text-sm text-muted-foreground">No comments yet. Start the conversation.</p>}

      <ol className="mb-4 space-y-3">
        {notes.data?.map((n) => {
          const author = profiles.data?.[n.author_id]
          const mine = n.author_id === user?.id
          return (
            <li key={n.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
              <UserAvatar profile={author} size={30} className="mt-1" />
              <div className={cn('group max-w-[85%] min-w-0', mine && 'items-end text-right')}>
                <div className={cn('mb-1 flex items-center gap-2 text-xs text-muted-foreground', mine && 'justify-end')}>
                  <span className="font-semibold text-foreground">{mine ? 'You' : (author?.username ?? 'someone')}</span>
                  <span title={exactTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                  {mine && editing !== n.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label="Comment options">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(n.id)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate(n.id, { onSuccess: () => toast.success('Comment deleted') })}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {editing === n.id ? (
                  <div className="text-left">
                    <MarkdownEditor
                      initial={n.body}
                      split={false}
                      minRows={3}
                      autoFocus
                      hint={false}
                      saving={edit.isPending}
                      saveLabel="Update"
                      onCancel={() => setEditing(null)}
                      onSave={(body) => {
                        if (!body.trim()) return
                        edit.mutate({ id: n.id, body }, { onSuccess: () => setEditing(null), onError: (e) => toast.error(e.message) })
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      'inline-block rounded-2xl px-4 py-2.5 text-left',
                      mine ? 'rounded-tr-md bg-brand-soft' : 'rounded-tl-md bg-subtle',
                    )}
                  >
                    <Markdown>{n.body}</Markdown>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          className="min-h-0 resize-none rounded-2xl"
          aria-label="Write a comment"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <Button variant="primary" size="icon" onClick={send} disabled={!draft.trim() || add.isPending} aria-label="Send comment">
          <SendHorizontal />
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
    </section>
  )
}
