import { X } from 'lucide-react'
import { useStore } from '../../lib/store'
import type { Campaign, EvidenceEntity } from '../../lib/types'
import { FitDot } from '../ui'

/** Every claim has receipts: the Qloo entities, tags and calls behind it. */
export function EvidenceDrawer({ c }: { c: Campaign }) {
  const id = useStore((s) => s.evidenceId)
  const close = useStore((s) => s.openEvidence)
  const ev = id ? c.evidence[id] : undefined

  if (!ev)
    return (
      <aside className="hidden w-11 shrink-0 flex-col items-center border-l border-line py-4 lg:flex">
        <span className="label rotate-180 [writing-mode:vertical-rl]">Evidence · click any footnote or highlight</span>
      </aside>
    )

  return (
    <>
      <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => close(null)} />
      <aside data-tour="evidence" className="slide-in scroll-thin fixed inset-y-0 right-0 z-40 w-[min(360px,92vw)] shrink-0 overflow-y-auto border-l border-line bg-paper-3 lg:static lg:z-auto">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-paper-3 px-4 py-3">
          <span className="label text-ink">Evidence</span>
          <span className="rounded bg-ink px-1.5 font-mono text-[9.5px] uppercase text-chalk">Qloo</span>
          <button onClick={() => close(null)} className="ml-auto rounded p-1 text-ink-3 hover:text-ink" aria-label="Close evidence">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 px-4 py-4">
          <div>
            <h3 className="font-display text-[22px] font-extrabold uppercase leading-[1.05]">{ev.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{ev.claim}</p>
          </div>

          {ev.from && (
            <div className="rounded-md border border-line bg-paper px-3 py-2">
              <p className="label mb-1">Replacing</p>
              <p className="text-[12.5px]">
                {ev.from.name}: {Object.entries(ev.from.byCity).map(([k, v]) => `${k} ${v}`).join(' · ')}
              </p>
            </div>
          )}

          {[...ev.entities, ...(ev.tagScores ?? [])].map((e) => (
            <Affinity key={e.id + e.name} e={e} />
          ))}

          {ev.tags.length > 0 && (
            <div>
              <p className="label mb-2">Taste tags</p>
              <ul className="space-y-1">
                {ev.tags.map((t) => (
                  <li key={t.id} className="flex items-baseline gap-2">
                    <span className="text-[12.5px]">{t.name}</span>
                    <span className="ml-auto truncate font-mono text-[9.5px] text-ink-3">{t.id}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="label mb-2">Qloo calls</p>
            <ul className="space-y-1.5">
              {ev.calls.map((call, i) => (
                <li key={i} className="break-all rounded bg-ink px-2 py-1.5 font-mono text-[10px] leading-relaxed text-chalk-2">
                  {call}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </>
  )
}

function Affinity({ e }: { e: EvidenceEntity }) {
  const rows = Object.keys(e.byCity).sort((a, b) => e.byCity[b] - e.byCity[a])
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <p className="text-[13.5px] font-semibold">{e.name}</p>
        <span className="ml-auto max-w-[50%] truncate font-mono text-[9.5px] text-ink-3" title={e.id}>
          {e.id}
        </span>
      </div>
      <p className="mb-2 font-mono text-[10px] text-ink-3">{e.type} · heatmap affinity by region</p>
      {!rows.length ? (
        <p className="text-[12px] text-ink-3">No regional data.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((x) => (
            <li key={x} className="grid grid-cols-[96px_1fr_28px] items-center gap-2">
              <span className="flex items-center gap-1.5 truncate text-[12px]">
                <FitDot value={e.byCity[x]} /> {x}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-paper-2">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${e.byCity[x]}%` }} />
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums">{e.byCity[x]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
