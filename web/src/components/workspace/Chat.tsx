import { ArrowUpRight, Paperclip, Pencil, Square, X } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { AGENTS } from '../../lib/agents'
import { useStore } from '../../lib/store'
import { useTour } from '../../lib/tour'
import type { Campaign, Chip as ChipT, Message } from '../../lib/types'
import { AgentTag, Footnote } from '../ui'
import { usePrompt } from '../usePrompt'
import { QuestionCard } from './QuestionCard'
import { ShotList } from './ShotList'

export function Chat({ c }: { c: Campaign }) {
  const end = useRef<HTMLDivElement>(null)
  const last = c.messages.at(-1)
  const lastPlan = last?.planId ? c.plans[last.planId] : undefined
  const tick = `${c.messages.length}:${lastPlan?.steps.reduce((a, s) => a + s.log.length, 0) ?? 0}`
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [tick])

  return (
    <div className="scroll-thin min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden break-words px-4 py-4">
      {!c.messages.length && (
        <p className="pt-6 text-center text-[13px] text-ink-3">
          Tell the agents what you need. Type <span className="font-mono text-ink-2">@</span> to pick one yourself.
        </p>
      )}
      {c.messages.map((m) => (
        <MessageView key={m.id} c={c} m={m} />
      ))}
      <div ref={end} />
    </div>
  )
}

function MessageView({ c, m }: { c: Campaign; m: Message }) {
  const submit = useStore((s) => s.submit)

  if (m.role === 'user') {
    const lastUser = [...c.messages].reverse().find((x) => x.role === 'user')?.id === m.id
    return (
      <div className="rise group ml-6 rounded-lg rounded-tr-sm bg-paper-2 px-3 py-2.5">
        <div className="mb-1 flex items-center">
          <p className="label">You</p>
          {lastUser && !c.busy && m.text && (
            <button
              onClick={() => useTour.getState().setDraft('composer', m.text)}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-3 opacity-0 transition hover:bg-paper-3 hover:text-ink group-hover:opacity-100 focus:opacity-100"
              title="Put this message back in the box to edit and resend"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
        {m.text && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{m.text}</p>}
        {!!m.attachments?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.attachments.map((a, i) => (
              <span key={i} className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
                <span className="uppercase text-ink-3">{a.format}</span> {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (m.planId && c.plans[m.planId]) return <ShotList c={c} plan={c.plans[m.planId]} />
  if (m.questions) return <QuestionCard campaignId={c.id} m={m} />

  return (
    <div className="rise" data-tour={m.evidenceIds?.length ? 'chat-answer' : undefined}>
      {m.agent && <AgentTag agent={m.agent} className="mb-1.5" />}
      <p className={`whitespace-pre-line text-[13.5px] leading-relaxed ${m.error ? 'text-fit-low' : ''}`}>
        {m.text}
        {m.evidenceIds?.map((id, i) => (
          <Footnote key={id} n={i + 1} evidenceId={id} />
        ))}
      </p>
      {!!m.chips?.length && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="label w-full">Next</span>
          {m.chips.map((ch: ChipT) => (
            <button
              key={ch.label}
              disabled={c.busy}
              onClick={() => submit(c.id, { text: ch.prompt, attachments: [], pinned: ch.agent })}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink px-2.5 py-1 text-[12.5px] font-medium transition hover:bg-ink hover:text-chalk disabled:opacity-40"
            >
              {ch.agent && <span className="font-mono text-[11px]">{AGENTS[ch.agent].glyph}</span>}
              {ch.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Composer({ c }: { c: Campaign }) {
  const submit = useStore((s) => s.submit)
  const stop = useStore((s) => s.stop)
  const p = usePrompt('composer')
  const send = () => {
    if (!p.canSend || c.busy) return
    submit(c.id, { text: p.text.trim(), attachments: p.attachments, pinned: p.pinned })
    p.reset()
    p.setPinned(undefined)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (p.mentionOptions.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault()
      p.pickMention(p.mentionOptions[0])
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="relative border-t border-line p-3">
      {p.mentionOptions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-md border border-ink bg-paper-3 shadow-card">
          {p.mentionOptions.map((a) => (
            <button key={a} onClick={() => p.pickMention(a)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-paper">
              <span className="font-mono text-xs">{AGENTS[a].glyph}</span>
              <span className="font-semibold">{AGENTS[a].name}</span>
              <span className="truncate text-xs text-ink-3">{AGENTS[a].line}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-ink bg-ink text-chalk focus-within:shadow-slate">
        {(p.pinned || p.attachments.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {p.pinned && (
              <span className="inline-flex items-center gap-1 rounded bg-chalk px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-ink">
                {AGENTS[p.pinned].glyph} {AGENTS[p.pinned].name}
                <button onClick={() => p.setPinned(undefined)} aria-label="Unpin agent">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {p.attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-chalk/10 px-1.5 py-0.5 font-mono text-[10.5px]">
                {a.name}
                <button onClick={() => p.setAttachments(p.attachments.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`}>
                  <X className="h-3 w-3 opacity-60" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={p.text}
          onChange={(e) => p.setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder={p.pinned ? AGENTS[p.pinned].placeholder : 'Ask anything, or paste a script…'}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13.5px] leading-relaxed placeholder:text-chalk-3 focus:outline-none"
          aria-label="Message the agents"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={p.fileRef} type="file" multiple className="hidden" onChange={(e) => p.onFiles(e.target.files)} />
          <button onClick={() => p.fileRef.current?.click()} className="rounded p-1.5 text-chalk-3 hover:text-chalk" aria-label="Attach a creative">
            <Paperclip className="h-4 w-4" />
          </button>
          <span className="font-mono text-[10px] text-chalk-3">@ to pick an agent</span>
          {c.busy ? (
            <button
              onClick={() => stop(c.id)}
              title="Stop the agents"
              className="ml-auto inline-flex items-center gap-1.5 rounded border border-chalk/40 px-2.5 py-1 font-display text-[14px] font-black uppercase tracking-[0.06em] text-chalk transition hover:bg-chalk hover:text-ink"
            >
              <Square className="h-3 w-3 fill-current" /> Stop
            </button>
          ) : (
            <button
              data-tour="composer-action"
              onClick={send}
              disabled={!p.canSend}
              className="ml-auto inline-flex items-center gap-1.5 rounded bg-chalk px-2.5 py-1 font-display text-[14px] font-black uppercase tracking-[0.06em] text-ink transition disabled:opacity-35"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-tally" />
              Action
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

