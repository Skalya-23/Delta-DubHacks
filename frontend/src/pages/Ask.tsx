import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowUp, Loader2, MessageCircleQuestion, Sparkles, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/PageSkeleton'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { questionsKey, useAskQuestion, useDeleteQuestion, useQuestions } from '@/hooks/useAiFeatures'
import { useAuth } from '@/hooks/useAuth'
import { useProjectCommits } from '@/hooks/useCommits'
import { useProfiles } from '@/hooks/useProfiles'
import { useProjectCtx } from '@/hooks/useProjectCtx'
import { watchQuestions } from '@/lib/capture'
import { timeAgo } from '@/lib/format'
import type { ProjectQuestion } from '@/lib/types'

const SUGGESTIONS = ['What changed in the last session?', 'When did it last work, and what changed since?', 'Who added the most parts?', 'Summarize the build so far.']
const MAX_LENGTH = 1000

function linkChanges(text: string, idBySeq: Map<number, string>, base: string): ReactNode {
  return text.split(/(#\d+)/g).map((part, i) => {
    const id = /^#\d+$/.test(part) ? idBySeq.get(Number(part.slice(1))) : undefined
    return id ? (
      <Link key={i} to={`${base}/change/${id}`} className="font-mono font-semibold underline underline-offset-2">
        {part}
      </Link>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  })
}

export function Ask() {
  const { project, base } = useProjectCtx()
  const { user } = useAuth()
  const qc = useQueryClient()
  const questions = useQuestions(project.id)
  const commits = useProjectCommits(project.id)
  const profiles = useProfiles()
  const ask = useAskQuestion(project.id)
  const remove = useDeleteQuestion(project.id)
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  const idBySeq = new Map((commits.data ?? []).map((c) => [c.seq, c.id]))
  const list = questions.data ?? []
  const waiting = list.some((q) => q.state === 'pending')

  useEffect(() => watchQuestions(project.id, () => qc.invalidateQueries({ queryKey: questionsKey(project.id) })), [project.id, qc])

  const lastState = list[list.length - 1]?.state
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [list.length, lastState])

  const send = (text: string) => {
    const question = text.trim()
    if (!question || ask.isPending) return
    ask.mutate(question.slice(0, MAX_LENGTH), {
      onSuccess: () => setDraft(''),
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[32px] leading-tight">Ask about this project</h1>
        <p className="mt-1.5 text-muted-foreground">
          Ask anything about the bench's history: what changed, who changed it, when it last worked. Perceptron answers from every change the camera saved.
        </p>
      </div>

      {questions.isLoading ? (
        <ListSkeleton rows={2} />
      ) : questions.error ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load questions">
          {(questions.error as Error).message}
        </EmptyState>
      ) : questions.data === null ? (
        <EmptyState icon={MessageCircleQuestion} title="Questions aren't set up yet">
          Run <code className="font-mono">supabase/migrations/004_session_summaries_and_questions.sql</code> in the Supabase SQL Editor, then reload this page.
        </EmptyState>
      ) : (
        <>
          {list.length === 0 ? (
            <EmptyState icon={MessageCircleQuestion} title="Ask your first question">
              The answer appears here in a few seconds, and your teammates can see it too.
            </EmptyState>
          ) : (
            <ol className="space-y-5" aria-live="polite">
              {list.map((q) => (
                <QuestionItem
                  key={q.id}
                  q={q}
                  asker={q.asked_by ? profiles.data?.[q.asked_by] : undefined}
                  mine={q.asked_by === user?.id}
                  onDelete={() => remove.mutate(q.id, { onError: (e) => toast.error(e.message) })}
                  onRetry={() => send(q.question)}
                  answer={q.answer ? linkChanges(q.answer, idBySeq, base) : null}
                />
              ))}
            </ol>
          )}
          <div ref={bottom} />

          <div className="sticky bottom-4 space-y-3">
            {list.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={ask.isPending}
                    className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ai/40 hover:text-ai"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              className="card flex items-end gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
              }}
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send(draft)
                  }
                }}
                maxLength={MAX_LENGTH}
                rows={2}
                placeholder={waiting ? 'Perceptron is answering…' : 'e.g. When did the motor stop working?'}
                aria-label="Your question"
                className="min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
              />
              <Button type="submit" variant="primary" size="icon" disabled={!draft.trim() || ask.isPending} aria-label="Ask">
                {ask.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

function QuestionItem({
  q,
  asker,
  mine,
  onDelete,
  onRetry,
  answer,
}: {
  q: ProjectQuestion
  asker?: Parameters<typeof UserAvatar>[0]['profile']
  mine: boolean
  onDelete: () => void
  onRetry: () => void
  answer: ReactNode
}) {
  return (
    <li className="group space-y-2">
      <div className="flex items-start gap-3">
        <UserAvatar profile={asker} size={28} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{asker?.username ?? 'Someone'}</span> · {timeAgo(q.created_at)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap">{q.question}</p>
        </div>
        {mine && (
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete question" className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="ml-10 rounded-2xl border border-ai/30 bg-ai-soft px-4 py-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ai">
          <Sparkles className="size-3.5" aria-hidden /> Perceptron
        </p>
        {q.state === 'pending' && (
          <div className="space-y-2">
            <p className="text-sm text-ai">Looking through the history…</p>
            <div className="shimmer h-3 w-3/4 rounded-full" />
          </div>
        )}
        {q.state === 'answered' && <p className="leading-relaxed whitespace-pre-wrap">{answer}</p>}
        {q.state === 'failed' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 text-broken" aria-hidden />
            <span>{q.answer || "Couldn't answer this one."}</span>
            <Button variant="ghost" size="xs" onClick={onRetry}>
              Ask again
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}
