import { AlertTriangle, ArrowRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { band, fitOrNull, splitBudget } from '../../lib/engine/scoring'
import { audienceOf, currencyOf, defaultCpm, exampleBudget, money, symbolOf } from '../../lib/regions'
import { downloadMetaCsv } from '../../lib/metaExport'
import { useStore } from '../../lib/store'
import type { Campaign, City, Creative } from '../../lib/types'
import { Score } from '../ui'
import { Panel } from './shared'

const CELL = { low: 'bg-fit-low/20', mid: 'bg-fit-mid/20', high: 'bg-fit-high/20' }

export function SpendView({ c, cities }: { c: Campaign; cities: City[] }) {
  const update = useStore((s) => s.updateBrief)
  const submit = useStore((s) => s.submit)
  const cur = currencyOf(c.brief)
  const budget = c.brief.budget ?? exampleBudget(cur)
  const creatives = Object.values(c.creatives)
  const rows = splitBudget(creatives, cities, budget, { reach: c.brief.reach, cpm: c.brief.cpm, defaultCpm: defaultCpm(c.brief) })
  const nameOf = (id: string) => c.creatives[id]?.name ?? '—'
  const letter = (id: string) => String.fromCharCode(65 + creatives.findIndex((x) => x.id === id))

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div>
          <p className="label">Total budget</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-3xl font-black">{symbolOf(cur)}</span>
            <input
              type="number"
              min={10000}
              step={10000}
              value={budget}
              onChange={(e) => update(c.id, { budget: Math.max(0, Number(e.target.value)) })}
              className="w-36 border-b-2 border-ink bg-transparent font-display text-3xl font-black tabular-nums focus:outline-none"
              aria-label={`Total budget in ${cur}`}
            />
            <span className="font-mono text-[11px] text-ink-3">{money(budget, cur)}</span>
          </div>
        </div>
        <p className="max-w-md flex-1 text-[12.5px] leading-relaxed text-ink-2">
          <button onClick={() => downloadMetaCsv(c, cities, budget)} className="btn-ink float-right ml-4" data-tour="meta-export">
            Download for Meta Ads Manager
          </button>
          A <strong>starting split</strong> from Qloo cultural fit × audience size ÷ CPM, with a 10% test floor per region. It is not a forecast: shift budget after 3–5 days of real results.
        </p>
      </div>

      <Panel data-tour="matrix" title="Fit matrix · creative × city">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-[13px]">
            <thead>
              <tr>
                <th />
                {cities.map((x) => (
                  <th key={x} className="label pb-1 font-medium">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creatives.map((cr: Creative) => (
                <tr key={cr.id}>
                  <td className="max-w-[220px] truncate pr-2 text-[12.5px] font-medium">
                    <span className="mr-1.5 font-mono text-[10px] text-ink-3">{letter(cr.id)}</span>
                    {cr.name}
                  </td>
                  {cities.map((x) => {
                    const s = fitOrNull(cr, x)
                    const chosen = rows.find((r) => r.city === x)?.creativeId === cr.id
                    return (
                      <td key={x} className={`rounded-md py-2 text-center ${s === null ? 'bg-paper-2' : CELL[band(s)]} ${chosen ? 'ring-2 ring-ink' : ''}`}>
                        {s === null ? <span className="font-mono text-[11px] text-ink-3">—</span> : <Score value={s} size="sm" />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[10.5px] text-ink-3">Outlined: the creative each city gets. Accept swaps in Adapt and this updates live.</p>
      </Panel>

      <Panel title="Recommended starting split">
        <ul className="space-y-3">
          {[...rows]
            .sort((a, b) => b.amount - a.amount)
            .map((r) => (
              <li key={r.city} className="grid grid-cols-[92px_1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[110px_1fr_auto_auto]">
                <span className="font-display text-xl font-extrabold uppercase leading-none">{r.city}</span>
                <div className="relative h-7 overflow-hidden rounded bg-paper-2">
                  <div className={`absolute inset-y-0 left-0 rounded transition-all duration-700 ${r.flag ? 'bg-fit-low/70' : 'bg-ink'}`} style={{ width: `${r.share * 100}%` }} />
                  <span className={`absolute inset-y-0 left-2 flex items-center font-mono text-[11px] font-semibold ${r.share > 0.18 ? 'text-chalk' : 'text-ink'}`} style={{ left: r.share > 0.18 ? 8 : `calc(${r.share * 100}% + 8px)` }}>
                    {Math.round(r.share * 100)}%
                  </span>
                </div>
                <span className="text-right font-display text-xl font-extrabold tabular-nums">{money(r.amount, cur)}</span>
                <span className="col-span-3 font-mono text-[10.5px] text-ink-3 sm:col-span-1 sm:w-[210px]">
                  {letter(r.creativeId)} · {nameOf(r.creativeId).slice(0, 22)} · fit {r.fit} · {r.audience}M · {symbolOf(cur)}{r.cpm} CPM
                </span>
                {r.flag && (
                  <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 rounded-md border border-fit-low/40 bg-fit-low/[0.06] px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-fit-low" />
                    <span className="text-[12.5px]">
                      <strong className="font-mono text-[10.5px] uppercase tracking-wider text-fit-low">Fix before you spend</strong> Large audience, weak fit for every creative.
                    </span>
                    <button
                      disabled={c.busy}
                      onClick={() => submit(c.id, { text: `Make it work in ${r.city}`, attachments: [], pinned: 'adapt' })}
                      className="btn-ink ml-auto disabled:opacity-40"
                    >
                      ⇄ Fix in Adapt <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      </Panel>

      <Assumptions c={c} cities={cities} />

      {!c.takes.some((t) => t.data.kind === 'deep') && (
        <button
          disabled={c.busy}
          onClick={() => submit(c.id, { text: 'Deep dive: which podcasts, shows and partners does this audience love, where in each city should we be, and how do we stack up against competitors?', attachments: [] })}
          className="card flex w-full items-center gap-3 px-5 py-3 text-left transition hover:border-ink disabled:opacity-40"
        >
          <span className="grid h-8 w-8 place-items-center rounded bg-ink font-mono text-chalk">◈</span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">Deep dive before you buy media</span>
            <span className="block text-[12.5px] text-ink-2">Who the ad really reaches, podcasts and shows its audience loves per city, venues for pop-ups, and competitors, connected into one read.</span>
          </span>
          <ArrowRight className="h-4 w-4" />
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Targeting c={c} cities={rows.filter((r) => !r.flag).map((r) => r.city)} />
        <Creators c={c} cities={rows.filter((r) => !r.flag && r.share >= 0.15).map((r) => r.city)} />
      </div>
    </div>
  )
}

function Assumptions({ c, cities }: { c: Campaign; cities: City[] }) {
  const update = useStore((s) => s.updateBrief)
  const [open, setOpen] = useState(false)
  const set = (field: 'reach' | 'cpm', city: string, v: string) => {
    const next = { ...(c.brief[field] ?? {}) }
    if (v === '' || Number(v) <= 0) delete next[city]
    else next[city] = Number(v)
    update(c.id, { [field]: next })
  }
  return (
    <Panel
      data-tour="assumptions"
      title="Assumptions · audience and CPM"
      right={
        <button onClick={() => setOpen(!open)} className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2 underline underline-offset-2">
          {open ? 'Hide' : 'Edit'}
        </button>
      }
    >
      {!open ? (
        <p className="text-[12.5px] text-ink-2">
          Defaults: an 18–34 audience estimate per preset city (1M for other regions) and {symbolOf(currencyOf(c.brief))}{defaultCpm(c.brief)} CPM everywhere. Paste Meta&apos;s estimated reach and your real CPMs for a better split.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className="text-left">
                <th className="label pb-2 font-medium">Region</th>
                <th className="label pb-2 font-medium">Audience (M)</th>
                <th className="label pb-2 font-medium">CPM ({symbolOf(currencyOf(c.brief))})</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr key={city} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-medium">{city}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={c.brief.reach?.[city] ?? ''}
                      placeholder={String(audienceOf(city))}
                      onChange={(e) => set('reach', city, e.target.value)}
                      className="w-24 rounded border border-line bg-paper-3 px-2 py-1 font-mono text-[12px] focus:border-ink focus:outline-none"
                      aria-label={`Audience in ${city}, millions`}
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={c.brief.cpm?.[city] ?? ''}
                      placeholder={String(defaultCpm(c.brief))}
                      onChange={(e) => set('cpm', city, e.target.value)}
                      className="w-24 rounded border border-line bg-paper-3 px-2 py-1 font-mono text-[12px] focus:border-ink focus:outline-none"
                      aria-label={`CPM in ${city}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function Targeting({ c, cities }: { c: Campaign; cities: City[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  return (
    <Panel title="Targeting pack · interests to try">
      <ul className="space-y-3">
        {cities.slice(0, 4).map((city) => {
          const p = c.profiles[city]
          const items = p ? p.domains.filter((d) => ['music', 'film', 'tv', 'brands'].includes(d.key)).flatMap((d) => d.items.slice(0, 2).map((i) => i.name)) : []
          return (
            <li key={city}>
              <div className="mb-1 flex items-center">
                <span className="label text-ink">{city}</span>
                {items.length > 0 && (
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(items.join(', ')).catch(() => {})
                      setCopied(city)
                      setTimeout(() => setCopied(null), 1400)
                    }}
                    className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-3 hover:text-ink"
                  >
                    <Copy className="h-3 w-3" /> {copied === city ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              {items.length ? (
                <div className="flex flex-wrap gap-1">
                  {items.map((t) => (
                    <span key={t} className="rounded border border-line bg-paper px-1.5 py-0.5 text-[11.5px]">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-ink-3">No Qloo interests for {city} yet.</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-3">From Qloo: what each region&apos;s audience over-indexes on. Check each interest exists in Meta Ads Manager before you use it.</p>
    </Panel>
  )
}

function Creators({ c, cities }: { c: Campaign; cities: City[] }) {
  return (
    <Panel title="Creator matcher · public figures">
      {!cities.length ? (
        <p className="text-[12.5px] text-ink-3">No region gets enough spend yet to look for partners.</p>
      ) : (
        <ul className="space-y-2.5">
          {cities.slice(0, 4).map((city) => {
            const people = c.profiles[city]?.domains.find((d) => d.key === 'people')?.items ?? []
            const artists = c.profiles[city]?.domains.find((d) => d.key === 'music')?.items ?? []
            const names = [...people.slice(0, 3), ...artists.slice(0, 2)].map((i) => i.name)
            return (
              <li key={city} className="flex items-baseline gap-3">
                <span className="label w-24 shrink-0 text-ink">{city}</span>
                <span className="text-[13px]">{names.length ? names.join(' · ') : '—'}</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-3">Public figures and artists Qloo ranks highest with your audience in each region. Not micro-influencers.</p>
    </Panel>
  )
}
