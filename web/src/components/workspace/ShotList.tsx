import { Check, X } from 'lucide-react'
import { metaOf } from '../../lib/agents'
import { useStore } from '../../lib/store'
import type { Campaign, Plan } from '../../lib/types'

/** The router's plan, shown as a shot list that ticks off while the agents roll. */
export function ShotList({ c, plan }: { c: Campaign; plan: Plan }) {
  const select = useStore((s) => s.selectTake)
  const rolling = !plan.finishedAt
  const stopped = plan.steps.some((s) => s.log.at(-1) === 'Stopped')
  const failed = plan.steps.some((s) => s.status === 'failed')
  const secs = plan.finishedAt ? ((plan.finishedAt - plan.startedAt) / 1000).toFixed(1) : null

  return (
    <div data-tour="shotlist" className="overflow-hidden rounded-lg border border-ink bg-ink text-chalk">
      <div className="flex items-center gap-2 border-b border-chalk/15 px-3 py-2">
        <span className="clapper-stripes-sm h-2.5 w-8 rounded-[2px]" />
        <span className="chalk-label text-chalk-2">Shot list</span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {rolling ? (
            <>
              <span className="tally-blink h-2 w-2 rounded-full bg-tally" /> Rolling
            </>
          ) : (
            <span className={stopped ? 'text-fit-mid' : failed ? 'text-fit-low' : 'text-chalk-3'}>
              {stopped ? 'Stopped' : failed ? 'Stopped on an error' : 'Wrapped'} · {secs}s
            </span>
          )}
        </span>
      </div>
      <ol>
        {plan.steps.map((s, i) => {
          const m = metaOf(s.agent)
          const showLog = rolling && s.status !== 'queued'
          return (
            <li key={s.id} className="border-b border-chalk/10 last:border-0">
              <button
                disabled={!s.takeId}
                onClick={() => s.takeId && select(c.id, s.takeId)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition enabled:hover:bg-chalk/5 ${s.status === 'queued' ? 'opacity-45' : ''}`}
              >
                <span className="w-5 font-mono text-[10px] text-chalk-3">{String(i + 1).padStart(2, '0')}</span>
                <span className="grid h-5 w-5 place-items-center rounded-[3px] bg-chalk/10 font-mono text-[11px]">{m.glyph}</span>
                <span className="flex-1 text-[13px] font-medium">{s.label}</span>
                {s.status === 'done' && <Check className="h-3.5 w-3.5 text-fit-high" />}
                {s.status === 'failed' && <X className="h-3.5 w-3.5 text-fit-low" />}
                {s.status === 'rolling' && <span className="tally-blink h-2 w-2 rounded-full bg-tally" />}
                {s.status === 'queued' && <span className="font-mono text-[10px] text-chalk-3">queued</span>}
              </button>
              {showLog && s.log.length > 0 && (
                <ul className="space-y-0.5 px-3 pb-2.5 pl-[58px]">
                  {s.log.map((l, j) => (
                    <li key={j} className="rise font-mono text-[10.5px] leading-snug text-chalk-2">
                      <span className="text-chalk-3">›</span> {l}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
