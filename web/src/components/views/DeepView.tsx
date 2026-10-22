import { ArrowRight, Compass, MapPin, Mic, Radar, ShoppingBag, Sparkles, Swords, Tv, Users } from 'lucide-react'
import { useState } from 'react'
import { AGENTS } from '../../lib/agents'
import { band } from '../../lib/engine/scoring'
import { useStore } from '../../lib/store'
import type { Campaign, City, DeepData } from '../../lib/types'
import { Footnote, Score } from '../ui'
import { HotspotMap, ItemList, matchOf, MatchBadge, PopBadge, SkewChart, skewLine, targetBands, VibeGap } from './intel'
import { Panel } from './shared'

const KIND: Record<string, string> = { fit: 'Fit', skew: 'Who', vibe: 'Vibe', also: 'Also loves', gems: 'Niche', rival: 'Rival', niche: 'Interest', hotspots: 'Hotspots', size: 'Size' }

export function DeepView({ c, cities, d }: { c: Campaign; cities: City[]; d: DeepData }) {
  const submit = useStore((s) => s.submit)
  const shown = cities.filter((x) => d.cities[x])
  const [city, setCity] = useState<City>(shown[0])
  const target = targetBands(d.skew.target.audience ?? c.brief.audience)
  const b = d.cities[city]
  let fn = 0

  return (
    <div className="space-y-5">
      {/* the strategist read: insights that each connect two or more signals */}
      <section data-tour="deep-read" className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-line bg-ink px-5 py-3 text-chalk">
          <Sparkles className="h-4 w-4" />
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-chalk-2">Strategist read · connected Qloo signals</p>
        </header>
        <div className="p-5">
          <p className="font-serif text-[21px] leading-snug">{d.summary}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {d.insights.map((i, k) => (
              <article key={k} className="flex flex-col rounded-md border border-line bg-paper-3 p-4">
                <div className="mb-2 flex flex-wrap gap-1">
                  {i.kinds.map((x, j) => (
                    <span key={`${x}-${j}`} className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-2">
                      {KIND[x] ?? x}
                    </span>
                  ))}
                </div>
                <h4 className="font-display text-[19px] font-extrabold uppercase leading-tight">{i.headline}</h4>
                <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ink-2">
                  {i.body}
                  {i.evidence.map((e, j) => (
                    <Footnote key={`${e}-${j}`} n={++fn} evidenceId={e} />
                  ))}
                </p>
                {i.action && (
                  <button
                    disabled={c.busy}
                    onClick={() => submit(c.id, { text: i.action!.prompt, attachments: [], pinned: i.action!.agent })}
                    className="btn mt-3 self-start disabled:opacity-40"
                  >
                    {AGENTS[i.action.agent]?.glyph} {i.action.label} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </article>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] text-ink-3">Every insight connects at least two Qloo signals and cites them. Pre-testing, not a forecast.</p>
        </div>
      </section>

      {/* who it speaks to */}
      {d.skew.ad && (
        <Panel data-tour="deep-skew" title="Who it speaks to · Qloo age and gender skew of its fans" right={<MatchBadge value={matchOf(d.skew.ad, target)} />}>
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <div>
              <p className="label mb-2">The whole ad · {skewLine(d.skew.ad)}</p>
              <SkewChart skew={d.skew.ad} target={target} />
              <p className="mt-2 text-[11px] text-ink-3">Outlined: your audience ({d.skew.target.audience ?? 'not set'}). −1…1 against everyone Qloo sees; 0 is average.</p>
            </div>
            <ul className="space-y-2.5">
              {d.skew.refs.map((r) => {
                const m = matchOf(r.skew, target)
                return (
                  <li key={r.refId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0">
                    <span className="truncate text-[13.5px] font-medium">
                      {r.label}
                      {r.evidenceId && <Footnote n="Q" evidenceId={r.evidenceId} />}
                    </span>
                    <MatchBadge value={m} />
                    <span className="font-mono text-[10.5px] text-ink-3">
                      via {r.via} · {skewLine(r.skew)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </Panel>
      )}

      {/* per city */}
      <div className="flex flex-wrap gap-1.5">
        {shown.map((x) => (
          <button
            key={x}
            onClick={() => setCity(x)}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition ${x === city ? 'border-ink bg-ink text-chalk' : 'border-line bg-paper-3 hover:border-ink'}`}
          >
            {x}
            {d.fits[x] !== undefined && <span className={`font-mono text-[11px] ${x === city ? 'text-chalk-2' : ''}`}>{d.fits[x]}</span>}
          </button>
        ))}
      </div>

      {b && (
        <div className="grid gap-5 lg:grid-cols-2">
          {(b.vibe.ad.length > 0 || b.vibe.city.length > 0) && (
            <Panel title={<span className="inline-flex items-center gap-1.5"><Compass className="h-3 w-3" /> Vibe gap · Qloo style and theme tags</span>}>
              <VibeGap ad={b.vibe.ad} city={b.vibe.city} cityName={city} />
              <p className="mt-3 text-[11.5px] text-ink-3">Qloo&apos;s tags for what sets your ad&apos;s references apart, against what sets {city}&apos;s top artists and film apart. Fixes should move toward the right-hand side.</p>
            </Panel>
          )}
          <Panel title={<span className="inline-flex items-center gap-1.5"><ShoppingBag className="h-3 w-3" /> Partners · brands this audience loves in {city}</span>}>
            <ItemList items={b.brands} />
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-1.5"><Mic className="h-3 w-3" /> Podcasts to sponsor</span>}>
            <ItemList items={b.podcasts} />
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-1.5"><Tv className="h-3 w-3" /> Shows to buy around</span>}>
            <ItemList items={b.tv} />
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Niche gems · artists, not mainstream</span>}>
            <ItemList items={b.gems} empty="No niche artists stand out here." />
            <p className="mt-2 text-[11px] text-ink-3">Authentic local picks that usually cost less to license than the mainstream ones.</p>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Hotspots · where in {city} it lands</span>}>
            {d.hotspots[city] ? (
              <div className="flex flex-wrap items-start gap-4">
                <HotspotMap center={d.hotspots[city].center} radiusKm={d.hotspots[city].radius_km} cells={d.hotspots[city].cells} places={b.places} />
                <div className="min-w-[160px] flex-1 text-[12.5px]">
                  <p className="label mb-1">Strongest for {d.hero}</p>
                  {d.hotspots[city].near.length ? <p>Near {d.hotspots[city].near.join(', ')}</p> : <p className="text-ink-3">No loved venue sits in the hottest cells.</p>}
                  <p className="label mb-1 mt-3">Places this audience loves</p>
                  <ul className="space-y-0.5">
                    {b.places.map((p, j) => (
                      <li key={`${p.id}-${j}`} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink" /> {p.name} <PopBadge value={p.popularity} />
                      </li>
                    ))}
                  </ul>
                  {d.hotspots[city].evidenceId && <Footnote n="Q" evidenceId={d.hotspots[city].evidenceId!} />}
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-3">Qloo&apos;s heatmap has no cells inside {city} for this reference.</p>
            )}
            <p className="mt-2 text-[11px] text-ink-3">Green squares: Qloo heatmap cells, darker is stronger. Dots: places this audience loves. For shoots, pop-ups and outdoor.</p>
          </Panel>
        </div>
      )}

      {(d.rivals.length > 0 || d.niche) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {d.rivals.length > 0 && (
            <Panel title={<span className="inline-flex items-center gap-1.5"><Swords className="h-3 w-3" /> Competitors · their strength vs your fit</span>}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left">
                    <th className="label pb-1.5 font-medium">City</th>
                    <th className="label pb-1.5 font-medium">Your fit</th>
                    {d.rivals.map((r) => (
                      <th key={r.id} className="label pb-1.5 font-medium">
                        {r.name}
                        <Footnote n="Q" evidenceId={r.evidenceId} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((x) => (
                    <tr key={x} className="border-t border-line">
                      <td className="py-1.5 font-medium">{x}</td>
                      <td>{d.fits[x] !== undefined ? <Score value={d.fits[x]} size="sm" /> : '—'}</td>
                      {d.rivals.map((r) => {
                        const vals = Object.values(r.byCity)
                        const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
                        const v = r.byCity[x]
                        const strong = v !== undefined && v - avg >= 3
                        const danger = strong && d.fits[x] !== undefined && band(d.fits[x]) === 'low'
                        return (
                          <td key={r.id} className={danger ? 'font-semibold text-fit-low' : ''}>
                            {v ?? '—'}
                            {v !== undefined && <span className="ml-1 font-mono text-[10px] text-ink-3">{v - avg >= 0 ? '+' : ''}{Math.round(v - avg)}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-ink-3">Each rival against its own average (big brands score high everywhere). Red: they are strong where your fit is weak.</p>
            </Panel>
          )}
          {d.niche && (
            <Panel title={<span className="inline-flex items-center gap-1.5"><Radar className="h-3 w-3" /> Where {d.niche.name} fans live</span>} right={<Footnote n="Q" evidenceId={d.niche.evidenceId} />}>
              <ul className="space-y-1.5">
                {Object.entries(d.niche.byCity)
                  .sort((a, b) => b[1] - a[1])
                  .map(([x, v]) => (
                    <li key={x} className="grid grid-cols-[96px_1fr_auto] items-center gap-2 text-[12.5px]">
                      <span>{x}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-paper-2">
                        <span className="block h-full rounded-full bg-ink" style={{ width: `${v}%` }} />
                      </span>
                      <span className="font-mono text-[11px] tabular-nums">
                        {v} <span className="text-ink-3">· fit {d.fits[x] ?? '—'}</span>
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-3">Where this interest audience concentrates (Qloo heatmap) next to how well the ad fits there.</p>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
