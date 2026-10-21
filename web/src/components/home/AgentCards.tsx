import { ArrowRight } from 'lucide-react'
import { AGENTS, BRAND_AGENTS, type AgentMeta } from '../../lib/agents'
import type { AgentId } from '../../lib/types'

export function AgentCards({ pinned, onPick, ids = BRAND_AGENTS, copy = {} }: { pinned?: AgentId; onPick: (a: AgentId) => void; ids?: AgentId[]; copy?: Partial<Record<AgentId, Partial<AgentMeta>>> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ids.map((id) => {
        const a = { ...AGENTS[id], ...copy[id] }
        const on = pinned === id
        return (
          <button
            key={id}
            onClick={() => onPick(id)}
            aria-pressed={on}
            className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition ${
              on ? 'border-ink bg-ink text-chalk shadow-slate' : 'border-line bg-paper-3 shadow-card hover:-translate-y-0.5 hover:border-ink'
            }`}
          >
            <div className={`flex items-center justify-between border-b px-4 py-2.5 ${on ? 'border-chalk/15' : 'border-line'}`}>
              <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.16em] ${on ? 'text-chalk-3' : 'text-ink-3'}`}>Scene {a.scene}</span>
              <span className={`clapper-stripes-sm h-2.5 w-10 rounded-[2px] ${on ? 'opacity-90' : 'opacity-70'}`} />
            </div>

            <div className="px-4 pt-3">
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-lg ${on ? 'text-chalk-2' : 'text-ink-3'}`}>{a.glyph}</span>
                <span className="font-display text-[34px] font-black uppercase leading-none tracking-[0.01em]">{a.name}</span>
              </div>
              <div className={`mt-3 h-[72px] rounded-md border p-2.5 ${on ? 'border-chalk/15 bg-chalk/5' : 'border-line bg-paper'}`}>
                <Preview id={id} dark={on} />
              </div>
            </div>

            <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
              <p className={`text-[15px] font-medium leading-snug ${on ? 'text-chalk' : 'text-ink'}`}>{a.line}</p>
              <dl className={`mt-3 space-y-1.5 text-[12px] leading-snug ${on ? 'text-chalk-2' : 'text-ink-2'}`}>
                <div className="flex gap-2">
                  <dt className={`w-11 shrink-0 font-mono text-[10px] uppercase tracking-wider ${on ? 'text-chalk-3' : 'text-ink-3'}`}>Bring</dt>
                  <dd>{a.bring}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className={`w-11 shrink-0 font-mono text-[10px] uppercase tracking-wider ${on ? 'text-chalk-3' : 'text-ink-3'}`}>Get</dt>
                  <dd>{a.get}</dd>
                </div>
              </dl>
              <span className={`mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold ${on ? 'text-chalk' : 'text-ink'}`}>
                {on ? 'Pinned to the slate' : 'Start'} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Preview({ id, dark }: { id: AgentId; dark: boolean }) {
  const muted = dark ? 'bg-chalk/20' : 'bg-ink/10'
  const ink = dark ? 'bg-chalk/70' : 'bg-ink/70'
  const lbl = `font-mono text-[8px] uppercase tracking-wider ${dark ? 'text-chalk-3' : 'text-ink-3'}`

  if (id === 'create')
    return (
      <div className="flex h-full items-end gap-3">
        {[
          ['DEL', [70, 45, 85]],
          ['CHE', [40, 90, 55]],
          ['KOL', [80, 35, 60]],
        ].map(([c, hs], i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-9 w-full items-end gap-[3px]">
              {(hs as number[]).map((h, j) => (
                <div key={j} className={`pv-grow-y flex-1 rounded-[2px] ${j === 1 ? ink : muted}`} style={{ height: `${h}%`, animationDelay: `${(i * 3 + j) * 90}ms` }} />
              ))}
            </div>
            <span className={lbl}>{c as string}</span>
          </div>
        ))}
      </div>
    )

  if (id === 'test')
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-8 rounded-sm ${muted}`} />
          <div className="pv-recolor h-2 w-12 rounded-sm" />
          <div className={`h-2 w-6 rounded-sm ${muted}`} />
          <div className={`h-2 w-10 rounded-sm ${muted}`} />
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-5 rounded-sm ${muted}`} />
          <div className={`h-2 w-9 rounded-sm ${muted}`} />
          <div className="pv-recolor h-2 w-14 rounded-sm" style={{ animationDelay: '300ms' }} />
        </div>
        <div className="flex gap-2">
          {['DEL 84', 'CHE 38'].map((t) => (
            <span key={t} className={lbl}>
              {t}
            </span>
          ))}
        </div>
      </div>
    )

  if (id === 'adapt')
    return (
      <div className="flex h-full flex-col justify-center gap-2 font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-fit-low">−</span>
          <span className={`relative ${dark ? 'text-chalk-2' : 'text-ink-2'}`}>
            Punjabi wedding
            <span className="pv-strike absolute left-0 top-1/2 h-px bg-fit-low" />
          </span>
        </div>
        <div className="pv-appear flex items-center gap-2">
          <span className="text-fit-high">+</span>
          <span className={dark ? 'text-chalk' : 'text-ink'}>Festival morning</span>
          <span className={`ml-auto ${lbl}`}>41→78</span>
        </div>
      </div>
    )

  if (id === 'grow')
    return (
      <div className="flex h-full flex-col justify-center gap-[5px]">
        {[
          ['HOME', 92, false],
          ['MUM', 81, true],
          ['PUN', 74, true],
          ['CHE', 38, false],
        ].map(([c, w, next], i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`${lbl} w-7`}>{c as string}</span>
            <div className={`pv-grow-x h-2 rounded-sm ${next ? 'bg-fit-high' : (w as number) < 50 ? muted : ink}`} style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
            {next && <span className={`${lbl} shrink-0`}>↗</span>}
          </div>
        ))}
      </div>
    )

  return (
    <div className="flex h-full flex-col justify-center gap-[5px]">
      {[88, 64, 42, 22].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`${lbl} w-6`}>{['DEL', 'MUM', 'CHE', 'KOL'][i]}</span>
          <div className={`pv-grow-x h-2 rounded-sm ${i === 3 ? 'bg-fit-low' : ink}`} style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
        </div>
      ))}
    </div>
  )
}
