import { AlertTriangle, Sparkles } from 'lucide-react'
import type { Commit } from '@/lib/types'

export function AnalyzingShimmer({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" aria-live="polite">
      <p className="text-ai">AI is looking at this change…</p>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="shimmer h-3.5 rounded-full" style={{ width: `${90 - i * 25}%` }} />
      ))}
    </div>
  )
}

/** "What the AI saw": the only place violet is used, so people always know the AI wrote it. */
export function AiCard({ commit }: { commit: Commit }) {
  return (
    <section className="card overflow-hidden border-ai/30" aria-labelledby="ai-heading">
      <div className="flex items-center gap-2 bg-ai-soft px-5 py-3">
        <Sparkles className="size-4 text-ai" aria-hidden />
        <h2 id="ai-heading" className="text-base">
          What the AI saw
        </h2>
        <span className="ml-auto rounded-full border border-ai/30 px-2.5 py-0.5 text-xs font-medium text-ai">Perceptron Mk1</span>
      </div>
      <div className="px-5 py-4">
        {commit.processing_state === 'pending' && <AnalyzingShimmer />}
        {commit.processing_state === 'failed' && (
          <div className="flex items-start gap-2 text-broken">
            <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">The AI couldn't describe this change.</p>
              {commit.mk1_summary && <p className="mt-1 text-muted-foreground">{commit.mk1_summary}</p>}
              <p className="mt-1 text-muted-foreground">You can still describe it yourself in "Your notes".</p>
            </div>
          </div>
        )}
        {commit.processing_state === 'described' && (
          <p className="text-[16px] leading-relaxed text-ai">{commit.mk1_summary || <span className="text-muted-foreground">The AI didn't say anything about this one.</span>}</p>
        )}
      </div>
    </section>
  )
}
