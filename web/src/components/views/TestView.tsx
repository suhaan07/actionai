import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { band, fitOrNull, fitScore, scorable } from '../../lib/engine/scoring'
import { useStore } from '../../lib/store'
import type { Campaign, City, Creative, Reference } from '../../lib/types'
import { Chip, FitBar, Footnote, Score } from '../ui'
import { HighlightedScript, Panel, Timeline } from './shared'

const BAND_WORD = { low: 'Weak fit', mid: 'Mixed', high: 'Strong fit' }

export function TestView({ c, creatives, cities }: { c: Campaign; creatives: Creative[]; cities: City[] }) {
  const submit = useStore((s) => s.submit)
  const open = useStore((s) => s.openEvidence)
  const [ci, setCi] = useState(0)
  const creative = creatives[Math.min(ci, creatives.length - 1)]
  const sortedCities = [...cities].sort((a, b) => fitScore(creative, b) - fitScore(creative, a))
  const [city, setCity] = useState<City>(sortedCities.at(-1) ?? cities[0])
  if (!creative) return null

  const refs = creative.refs.filter((r) => scorable(r) && r.scores[city] !== undefined)
  const helps = refs.filter((r) => r.scores[city]! >= 70).sort((a, b) => b.scores[city]! - a.scores[city]!)
  const hurts = refs.filter((r) => r.scores[city]! < 50).sort((a, b) => a.scores[city]! - b.scores[city]!)
  const timed = creative.format === 'video' || creative.format === 'reel'
  const score = fitScore(creative, city)

  return (
    <div className="space-y-5">
      {creatives.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {creatives.map((cr, i) => (
            <button
              key={cr.id}
              onClick={() => setCi(i)}
              className={`rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition ${i === ci ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper-3 hover:border-ink'}`}
            >
              <span className="mr-1.5 font-mono text-[10px] opacity-60">{String.fromCharCode(65 + i)}</span>
              {cr.name}
            </button>
          ))}
        </div>
      )}

      {/* city strip: click a city and the script recolours */}
      <div data-tour="city-strip" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cities.map((x) => {
          const raw = fitOrNull(creative, x)
          const s = raw ?? 0
          const on = x === city
          return (
            <button
              key={x}
              data-tour={`city-${x}`}
              onClick={() => setCity(x)}
              className={`rounded-lg border px-3 pb-2.5 pt-2 text-left transition ${on ? 'border-ink bg-paper-3 shadow-card' : 'border-line hover:border-ink-3'}`}
              aria-pressed={on}
            >
              <span className="label block">{x}</span>
              {raw === null ? <span className="font-display text-3xl font-extrabold text-ink-3">—</span> : <Score value={s} size="lg" />}
              <span className="mt-1.5 block">
                <FitBar value={s} />
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {timed && (
            <Panel title={`Cue timeline · ${city}`}>
              <Timeline creative={creative} city={city} />
            </Panel>
          )}
          <Panel
            title={`${creative.name} · read in ${city}`}
            right={
              <span className="inline-flex items-center gap-2">
                <Score value={score} size="md" />
                <span className="font-mono text-[10.5px] uppercase text-ink-3">{BAND_WORD[band(score)]}</span>
              </span>
            }
          >
            <div data-tour="script">
              <HighlightedScript creative={creative} city={city} onRef={(r) => open(r.evidenceId)} />
            </div>
            <p className="mt-4 font-mono text-[10.5px] text-ink-3">Click any highlight for the Qloo data behind its score. Pre-test prediction, not an A/B result.</p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="What helps · what hurts">
            <RefList title="Hurts" refs={hurts} city={city} empty="Nothing drags this down here." />
            <div className="my-3 h-px bg-line" />
            <RefList title="Helps" refs={helps} city={city} empty="No reference over-indexes here yet." />
            {hurts.length > 0 && (
              <button
                data-tour="adapt-cta"
                disabled={c.busy}
                onClick={() => submit(c.id, { text: `Make it work in ${city}`, attachments: [], pinned: 'adapt' })}
                className="btn-ink mt-4 w-full justify-center disabled:opacity-40"
              >
                ⇄ Adapt it for {city} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </Panel>
          <Personas c={c} creative={creative} city={city} />
        </div>
      </div>

      {creatives.length > 1 && <Compare creatives={creatives} cities={cities} />}
    </div>
  )
}

function RefList({ title, refs, city, empty }: { title: string; refs: Reference[]; city: City; empty: string }) {
  return (
    <div>
      <p className="label mb-2">{title}</p>
      {!refs.length ? (
        <p className="text-[12.5px] text-ink-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {refs.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3">
              <Score value={r.scores[city]!} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{r.label}</span>
              <Footnote n={i + 1} evidenceId={r.evidenceId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Personas({ c, creative, city }: { c: Campaign; creative: Creative; city: City }) {
  const load = useStore((s) => s.loadPersonas)
  const key = `${creative.id}:${city}`
  const loading = useStore((s) => s.loadingPersonas[key])
  const ps = c.personas[key]
  useEffect(() => load(c.id, creative.id, city), [c.id, creative.id, city, load])

  return (
    <Panel data-tour="personas" title={`Persona panel · ${city}`} right={<span className="rounded border border-dashed border-line-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-3">Simulated</span>}>
      {!ps ? (
        <ul className="space-y-3.5" aria-busy={loading}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-3">
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-paper-2" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 w-11/12 animate-pulse rounded bg-paper-2" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-paper-2" />
              </div>
            </li>
          ))}
          <li className="font-mono text-[10.5px] text-ink-3">Building taste clusters for {city} from Qloo…</li>
        </ul>
      ) : !ps.length ? (
        <p className="text-[12.5px] text-ink-3">Couldn't build personas for {city} right now.</p>
      ) : (
        <ul className="space-y-3.5">
          {ps.map((p) => (
            <li key={p.band} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10px] text-chalk">{p.band.split(' · ')[0]}</span>
              <div className="min-w-0">
                <p className="font-serif text-[16px] italic leading-snug">“{p.reaction}”</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="font-mono text-[10px] text-ink-3">{p.band} · built from</span>
                  {[...p.tags, ...p.likes].slice(0, 6).map((t) => (
                    <Chip key={t} className="!py-0 !text-[10px]">
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-3">Each persona is a Qloo taste cluster for an age and gender band in {city}. Not real people.</p>
    </Panel>
  )
}

function Compare({ creatives, cities }: { creatives: Creative[]; cities: City[] }) {
  return (
    <Panel title="Side by side">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr>
              <th className="pb-2 text-left font-normal" />
              {cities.map((x) => (
                <th key={x} className="label pb-2 text-center font-medium">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creatives.map((cr, i) => (
              <tr key={cr.id} className="border-t border-line">
                <td className="py-2 pr-3 font-medium">
                  <span className="mr-1.5 font-mono text-[10px] text-ink-3">{String.fromCharCode(65 + i)}</span>
                  {cr.name}
                </td>
                {cities.map((x) => {
                  const s = fitScore(cr, x)
                  const best = Math.max(...creatives.map((o) => fitScore(o, x)))
                  return (
                    <td key={x} className="py-2 text-center">
                      <span className={`inline-block rounded px-1.5 ${s === best ? 'ring-1 ring-ink' : ''}`}>
                        <Score value={s} size="sm" />
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
