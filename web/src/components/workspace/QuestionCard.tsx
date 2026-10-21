import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../lib/store'
import type { Message } from '../../lib/types'

/** The agent asks before it rolls: one question at a time, with an Auto-answer from what it inferred. */
export function QuestionCard({ campaignId, m }: { campaignId: string; m: Message }) {
  const answer = useStore((s) => s.answer)
  const qs = m.questions!
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<Record<string, string[]>>({})

  if (m.questionsDone)
    return (
      <div className="rounded-lg border border-line bg-paper-3 px-3 py-2.5">
        <p className="label mb-1.5">Answered</p>
        <ul className="space-y-2 text-[12.5px]">
          {qs.map((q) => (
            <li key={q.id} className="min-w-0">
              <p className="text-ink-3">{q.prompt}</p>
              <p className="mt-0.5 break-words font-medium">{(q.answer ?? []).map((v) => q.options.find((o) => o.value === v)?.label ?? v).join(', ')}</p>
            </li>
          ))}
        </ul>
      </div>
    )

  const q = qs[i]
  const sel = picked[q.id] ?? []
  const toggle = (v: string) =>
    setPicked((p) => ({ ...p, [q.id]: q.multi ? (sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]) : [v] }))
  const last = i === qs.length - 1
  const finish = (auto = false) => {
    const out: Record<string, string[]> = {}
    for (const qq of qs) out[qq.id] = auto ? qq.auto : picked[qq.id]?.length ? picked[qq.id] : qq.auto
    answer(campaignId, m.id, out)
  }

  return (
    <div className="rise overflow-hidden rounded-lg border border-ink bg-paper-3 shadow-card">
      <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2">
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="text-[12.5px] font-semibold">The agent has a few calls for you</span>
      </div>
      <div className="px-3 py-3">
        <p className="text-[14px] font-medium leading-snug">{q.prompt}</p>
        <div className={`mt-2.5 ${q.multi ? 'flex flex-wrap gap-1.5' : 'space-y-1'}`}>
          {q.options.map((o) => {
            const on = sel.includes(o.value)
            return q.multi ? (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] transition ${on ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper hover:border-ink'}`}
              >
                {o.label}
              </button>
            ) : (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className={`flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition ${on ? 'border-ink bg-paper' : 'border-transparent hover:border-line'}`}
              >
                <span className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${on ? 'border-ink' : 'border-line-2'}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                </span>
                <span>
                  <span className="text-[13px] font-medium">{o.label}</span>
                  {o.hint && <span className="block text-[11.5px] text-ink-3">{o.hint}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <button disabled={i === 0} onClick={() => setI(i - 1)} className="rounded p-1 text-ink-3 enabled:hover:text-ink disabled:opacity-30" aria-label="Previous question">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-[10.5px] text-ink-3">
          {i + 1} of {qs.length}
        </span>
        <button disabled={last} onClick={() => setI(i + 1)} className="rounded p-1 text-ink-3 enabled:hover:text-ink disabled:opacity-30" aria-label="Next question">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => finish(true)} className="btn ml-auto" title="Use what the agent inferred">
          Auto-answer
        </button>
        <button onClick={() => (last ? finish() : setI(i + 1))} className="btn-ink">
          {last ? 'Roll' : 'Next'}
        </button>
      </div>
    </div>
  )
}
