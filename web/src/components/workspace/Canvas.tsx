import { useEffect, useRef } from 'react'
import { AGENTS, AGENT_ORDER, metaOf } from '../../lib/agents'
import { useStore } from '../../lib/store'
import { marketOf } from '../../lib/regions'
import type { Campaign, Creative } from '../../lib/types'
import { AdaptView } from '../views/AdaptView'
import { CreateView } from '../views/CreateView'
import { GrowView } from '../views/GrowView'
import { ReadoutView } from '../views/ReadoutView'
import { SpendView } from '../views/SpendView'
import { TestView } from '../views/TestView'

export function Canvas({ c }: { c: Campaign }) {
  const select = useStore((s) => s.selectTake)
  const take = c.takes.find((t) => t.id === c.selectedTakeId) ?? c.takes.at(-1)
  const scroller = useRef<HTMLDivElement>(null)
  // What is rolling right now, for the skeleton and the placeholder take.
  const live = Object.values(c.plans).find((p) => !p.finishedAt)
  const rollingStep = live?.steps.find((s) => s.status === 'rolling')
  const rolling = c.busy ? (rollingStep?.label ?? 'Thinking') : null
  // Each take opens at the top, not wherever the previous one was scrolled to.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [take?.id])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {(c.takes.length > 0 || rolling) && (
        <nav className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5" aria-label="Takes">
          {c.takes.map((t) => {
            const on = t.id === take?.id
            return (
              <button
                key={t.id}
                onClick={() => select(c.id, t.id)}
                className={`group flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition ${on ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper-3 hover:border-ink'}`}
              >
                <span className={`font-mono text-[9.5px] ${on ? 'text-chalk-3' : 'text-ink-3'}`}>TAKE {String(t.n).padStart(2, '0')}</span>
                <span className="font-mono text-[11px]">{metaOf(t.agent).glyph}</span>
                <span className="max-w-[180px] truncate text-[12.5px] font-medium">{t.title}</span>
              </button>
            )
          })}
          {rolling && (
            <span className="flex shrink-0 animate-pulse items-center gap-2 rounded-md border border-dashed border-line-2 px-2.5 py-1.5">
              <span className="font-mono text-[9.5px] text-ink-3">TAKE {String(c.takes.length + 1).padStart(2, '0')}</span>
              <span className="tally-blink h-1.5 w-1.5 rounded-full bg-tally" />
              <span className="text-[12.5px] font-medium text-ink-2">{rolling}…</span>
            </span>
          )}
        </nav>
      )}
      <div ref={scroller} className="scroll-thin flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {take ? <TakeBody c={c} takeId={take.id} key={take.id} /> : rolling ? <Skeleton label={rolling} /> : <QuietOnSet c={c} />}
      </div>
    </div>
  )
}

function TakeBody({ c, takeId }: { c: Campaign; takeId: string }) {
  const take = c.takes.find((t) => t.id === takeId)!
  const d = take.data
  const header = (
    <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-1">
      <div>
        <p className="label">
          Take {String(take.n).padStart(2, '0')} · {metaOf(take.agent).name} agent
        </p>
        <h2 className="font-display text-[40px] font-black uppercase leading-[0.95]">{take.title.split(' · ').slice(1).join(' · ') || take.title}</h2>
      </div>
      <p className="pb-1 text-[12.5px] text-ink-3">{take.agent === 'read' ? metaOf('read').get : AGENTS[take.agent as keyof typeof AGENTS].get}</p>
    </header>
  )

  let body = null
  if (d.kind === 'readout') body = c.creatives[d.creativeId] ? <ReadoutView c={c} creative={c.creatives[d.creativeId]} /> : null
  if (d.kind === 'test') body = <TestView c={c} creatives={d.creativeIds.map((id) => c.creatives[id]).filter(Boolean) as Creative[]} cities={d.cities.length ? d.cities : [...marketOf(c.brief).cities]} />
  if (d.kind === 'adapt') body = <AdaptView c={c} take={take} />
  if (d.kind === 'spend') body = <SpendView c={c} cities={d.cities} />
  if (d.kind === 'create') body = <CreateView c={c} cities={d.cities} master={d.master} />
  if (d.kind === 'grow') body = <GrowView c={c} creative={d.creativeId ? c.creatives[d.creativeId] : undefined} home={d.home} cities={d.cities} targets={d.targets} plans={d.plans} />

  return (
    <div className="rise mx-auto max-w-[1200px]">
      {header}
      {body}
    </div>
  )
}

function QuietOnSet({ c }: { c: Campaign }) {
  const submit = useStore((s) => s.submit)
  const busy = c.busy || c.messages.some((m) => m.questions && !m.questionsDone)
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center py-10 text-center">
      <p className="label">{busy ? 'Standing by' : 'Empty set'}</p>
      <h2 className="mt-2 font-display text-6xl font-black uppercase leading-[0.9]">
        Quiet on set<span className="text-tally">.</span>
      </h2>
      <p className="mx-auto mt-4 max-w-sm text-[14px] text-ink-2">
        {busy ? 'The agents are getting ready. Results appear here as takes.' : 'Tell the agents what you need on the left. The router sends it to Create, Test, Adapt, Spend or Grow, and every result lands here as a take.'}
      </p>
      {!busy && (
        <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
          {AGENT_ORDER.map((a) => (
            <button
              key={a}
              onClick={() => submit(c.id, { text: AGENTS[a].examples[0], attachments: [], pinned: a })}
              className="rounded-md border border-line bg-paper-3 px-3 py-2.5 text-[13px] transition hover:border-ink"
            >
              <span className="label block">
                {AGENTS[a].glyph} {AGENTS[a].name}
              </span>
              {AGENTS[a].examples[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Placeholder layout while the first take of a campaign is being made. */
function Skeleton({ label }: { label: string }) {
  const bar = 'animate-pulse rounded bg-paper-2'
  return (
    <div className="mx-auto max-w-[1200px]" aria-busy="true" aria-label={`${label}, working`}>
      <div className={`${bar} h-3 w-40`} />
      <div className={`${bar} mt-3 h-10 w-80`} />
      <p className="mt-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-ink-3">
        <span className="tally-blink h-2 w-2 rounded-full bg-tally" /> {label}… usually 20–60 seconds the first time, instant after
      </p>
      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card h-20 p-3">
            <div className={`${bar} h-2 w-12`} />
            <div className={`${bar} mt-3 h-6 w-10`} />
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card space-y-3 p-5">
          {[92, 100, 84, 96, 70].map((w, i) => (
            <div key={i} className={`${bar} h-4`} style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="card space-y-3 p-5">
          {[60, 80, 50, 75].map((w, i) => (
            <div key={i} className={`${bar} h-4`} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
