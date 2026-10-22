import { Check, Copy, Handshake, Music2, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { band, fitOrNull } from '../../lib/engine/scoring'
import { growRanking } from '../../lib/engine/steps'
import type { Campaign, City, Creative, GrowPlan, SkewBundle } from '../../lib/types'
import { Chip, Footnote, Score } from '../ui'
import { ItemList, matchOf, MatchBadge, PopBadge, SkewChart, skewLine, targetBands } from './intel'
import { Panel } from './shared'

const BAR = { low: 'bg-fit-low', mid: 'bg-fit-mid', high: 'bg-fit-high' }

export function GrowView({ c, creative, home, cities, targets, plans, skew }: { c: Campaign; creative?: Creative; home?: City; cities: City[]; targets: City[]; plans: Record<string, GrowPlan>; skew?: SkewBundle | null }) {
  if (!creative) return <p className="text-[14px] text-ink-3">The content this plan was built from is no longer in the campaign.</p>
  const ranked = growRanking(creative, cities, home, c.brief.reach)
  const target = targetBands(c.brief.audience || '18–24')
  let fn = 0

  return (
    <div className="space-y-5">
      <Panel data-tour="grow-map" title="Where your content lands · Qloo fit × people there">
        <ul className="space-y-1.5">
          {ranked.map((r) => {
            const tag = r.home ? 'Home' : targets.includes(r.city) ? 'Grow next' : r.fit < 50 ? 'Needs a rewrite' : ''
            return (
              <li key={r.city} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 sm:grid-cols-[130px_1fr_auto_110px]">
                <span className={`truncate font-display text-[17px] font-extrabold uppercase leading-none ${targets.includes(r.city) || r.home ? 'text-ink' : 'text-ink-2'}`}>{r.city}</span>
                <div className="relative h-5 overflow-hidden rounded bg-paper-2">
                  <div className={`absolute inset-y-0 left-0 rounded transition-all duration-700 ${BAR[band(r.fit)]} ${targets.includes(r.city) || r.home ? '' : 'opacity-50'}`} style={{ width: `${r.fit}%` }} />
                </div>
                <Score value={r.fit} size="sm" />
                <span className="hidden font-mono text-[10px] uppercase tracking-wider sm:block">
                  {tag && <span className={r.home ? 'text-ink-3' : targets.includes(r.city) ? 'font-semibold text-ink' : 'text-fit-low'}>{tag}</span>}
                  <span className="ml-1 text-ink-3">· {r.audience}M</span>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-3">
          Fit is how strongly each city&apos;s audience over-indexes on the references in your content (Qloo heatmaps). Cities are ranked by fit, weighted by roughly how many 18–34s live there. It is not a follower forecast.
        </p>
      </Panel>

      {skew?.ad && (
        <Panel title="Who your content's fans are · Qloo, in aggregate" right={<MatchBadge value={matchOf(skew.ad, target)} />}>
          <div className="grid gap-5 sm:grid-cols-[240px_1fr]">
            <div>
              <p className="label mb-2">{skewLine(skew.ad)}</p>
              <SkewChart skew={skew.ad} target={target} compact />
            </div>
            <ul className="space-y-1.5 text-[12.5px]">
              {skew.refs.map((r) => (
                <li key={r.refId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="font-mono text-[10.5px] text-ink-3">via {r.via} · {skewLine(r.skew)}</span>
                  {r.evidenceId && <Footnote n="Q" evidenceId={r.evidenceId} />}
                </li>
              ))}
              <li className="pt-1 text-[11.5px] text-ink-3">Outlined: {c.brief.audience || '18–24'}. If your content pulls an older or one-gender crowd, the hooks below lean toward what each city&apos;s younger fans like.</li>
            </ul>
          </div>
        </Panel>
      )}

      <div className="space-y-5">
        {targets.map((city) => {
          const p = plans[city]
          if (!p) return null
          const fit = fitOrNull(creative, city) ?? 0
          const refs = creative.refs.filter((r) => r.enabled && r.kind !== 'unmatched' && r.scores[city] !== undefined)
          const lands = refs.filter((r) => r.scores[city] >= 70).sort((a, b) => b.scores[city] - a.scores[city])
          const drags = refs.filter((r) => r.scores[city] < 50).sort((a, b) => a.scores[city] - b.scores[city])
          return (
            <article key={city} data-tour="grow-city" className={`card overflow-hidden ${p.flag ? 'border-fit-low/50' : ''}`}>
              <header className="flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-line bg-ink px-5 py-3 text-chalk">
                <h3 className="font-display text-[34px] font-black uppercase leading-none">{city}</h3>
                <span className="pb-0.5 font-mono text-[11px] uppercase tracking-wider text-chalk-3">
                  fit <span className="font-semibold text-chalk">{fit}</span>
                  {home && <> · {home} {fitOrNull(creative, home)}</>}
                </span>
              </header>
              <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
                <div className="space-y-4">
                  <div>
                    <p className="label mb-1">Open with</p>
                    <p className="font-serif text-[22px] italic leading-snug">“{p.hook}”</p>
                  </div>
                  <PostBox caption={p.caption} hashtags={p.hashtags} />
                  <p className="flex items-start gap-2 text-[13px] text-ink-2">
                    <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                    <span>
                      <span className="label mr-1.5">Audio</span>
                      {p.audio}
                    </span>
                  </p>
                  {(lands.length > 0 || drags.length > 0) && (
                    <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                      <RefList title="Already lands here" refs={lands.slice(0, 4)} city={city} tone="text-fit-high" />
                      <RefList title="Holding it back" refs={drags.slice(0, 4)} city={city} tone="text-fit-low" />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-md border border-line bg-paper p-3">
                    <p className="label mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" /> Add one local touch
                    </p>
                    <p className="text-[14px] leading-snug">
                      {p.touch.text}
                      {p.touch.evidenceId && <Footnote n={++fn} evidenceId={p.touch.evidenceId} />}
                    </p>
                    {p.touch.basis.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.touch.basis.map((b) => (
                          <Chip key={b}>{b}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="label mb-1.5 flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> Duet, stitch or collab · creators {city} loves
                    </p>
                    {p.creators.length ? (
                      <ul className="space-y-1.5">
                        {p.creators.map((x) => (
                          <li key={x.id} className="flex items-baseline gap-2 text-[13px]">
                            <Score value={x.score} size="sm" />
                            <span className="font-medium">{x.name}</span>
                            <Footnote n={++fn} evidenceId={x.evidenceId} />
                            {x.tier && (
                              <span className={`rounded px-1 font-mono text-[9px] uppercase tracking-wider ${x.tier === 'reach' ? 'bg-fit-high/15 text-fit-high' : 'bg-paper-2 text-ink-3'}`}>
                                {x.tier === 'reach' ? 'Pitch a collab' : 'Duet or stitch'}
                              </span>
                            )}
                            <PopBadge value={x.popularity} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12.5px] text-ink-3">Qloo tags no social creators among {city}&apos;s top public figures yet.</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-ink-3">Ranked by how much {city}&apos;s audience likes them, not by niche. Big names: duet, stitch or react to them; smaller ones: pitch a collab.</p>
                  </div>
                  {p.deals && (p.deals.brands.length > 0 || p.deals.podcasts.length > 0) && (
                    <div>
                      <p className="label mb-1.5 flex items-center gap-1.5">
                        <Handshake className="h-3 w-3" /> Brand deals and podcasts · what your fans love in {city}
                        {p.deals.evidenceId && <Footnote n={++fn} evidenceId={p.deals.evidenceId} />}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ItemList items={p.deals.brands} empty="No brands stand out." />
                        <ItemList items={p.deals.podcasts} empty="No podcasts stand out." />
                      </div>
                      <p className="mt-1.5 text-[11px] text-ink-3">Brands to pitch for a deal and podcasts to guest on. Number: Qloo affinity with your fans here.</p>
                    </div>
                  )}
                  {p.flag && (
                    <div className="rounded-md border border-fit-low/50 bg-fit-low/[0.06] px-3 py-2 text-[12.5px]">
                      <p className="flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-fit-low">
                        <ShieldAlert className="h-3 w-3" /> Sensitivity check · review before posting
                      </p>
                      <p className="mt-1">{p.flag.reason}</p>
                      {p.flag.safer && <p className="mt-1 text-ink-3">Safer: {p.flag.safer}</p>}
                    </div>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <p className="text-[12px] text-ink-3">
        Qloo has no data on posting times, trends or the algorithm, so none of that is guessed here. Check your own Insights for when your followers are online.
      </p>
    </div>
  )
}

function RefList({ title, refs, city, tone }: { title: string; refs: Creative['refs']; city: City; tone: string }) {
  return (
    <div>
      <p className="label mb-1">{title}</p>
      {refs.length ? (
        <ul className="space-y-0.5 text-[12.5px]">
          {refs.map((r) => (
            <li key={r.id} className="flex items-baseline gap-1.5">
              <span className={`font-mono text-[11px] font-semibold tabular-nums ${tone}`}>{r.scores[city]}</span>
              <span className="truncate">{r.label}</span>
              {r.evidenceId && <Footnote n="Q" evidenceId={r.evidenceId} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-3">Nothing</p>
      )}
    </div>
  )
}

function PostBox({ caption, hashtags }: { caption: string; hashtags: string[] }) {
  const [copied, setCopied] = useState(false)
  const text = `${caption}\n\n${hashtags.join(' ')}`
  return (
    <div className="rounded-md border border-line bg-paper-3 p-3">
      <div className="mb-1 flex items-center">
        <p className="label">Caption</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(text).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          }}
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-3 hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy caption + tags'}
        </button>
      </div>
      <p className="whitespace-pre-line text-[14px] leading-relaxed">{caption}</p>
      <p className="mt-2 text-[13px] text-ink-2">{hashtags.join(' ')}</p>
    </div>
  )
}
