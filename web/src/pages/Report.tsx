import { ArrowLeft, Download, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { metaOf } from '../lib/agents'
import { band, fitOrNull, splitBudget } from '../lib/engine/scoring'
import { currencyOf, defaultCpm, marketOf, money } from '../lib/regions'
import { useStore } from '../lib/store'
import type { Campaign, Creative, Take } from '../lib/types'
import { Logo, Score } from '../components/ui'

const CELL = { low: 'bg-fit-low/15', mid: 'bg-fit-mid/15', high: 'bg-fit-high/15' }

/** A clean, read-only campaign report to forward to a boss or client. Prints to PDF. */
export default function Report() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const c = useStore((s) => s.campaigns[id])
  const loadRemote = useStore((s) => s.loadRemote)
  const [missing, setMissing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!c) loadRemote(id).then((ok) => !ok && setMissing(true))
  }, [c, id, loadRemote])
  useEffect(() => {
    if (c && params.get('print') === '1') setTimeout(() => window.print(), 600)
  }, [c, params])

  if (missing) return <p className="p-10 text-center text-ink-2">This report doesn&apos;t exist, or hasn&apos;t been saved to the server yet.</p>
  if (!c) return <p className="p-10 text-center font-mono text-[11px] uppercase tracking-wider text-ink-3">Loading report…</p>

  const originals = Object.values(c.creatives).filter((x) => !x.parentId)
  const cities = c.brief.cities.length ? c.brief.cities : marketOf(c.brief).cities
  const cur = currencyOf(c.brief)
  const create = [...c.takes].reverse().find((t) => t.data.kind === 'create')
  const adapts = c.takes.filter((t) => t.data.kind === 'adapt')
  const spend = [...c.takes].reverse().find((t) => t.data.kind === 'spend')
  const grow = [...c.takes].reverse().find((t) => t.data.kind === 'grow')
  const deep = [...c.takes].reverse().find((t) => t.data.kind === 'deep')
  const answers = c.messages.filter((m) => m.role === 'agent' && m.evidenceIds?.length && !m.planId)
  const overrides = adapts.flatMap((t) => (t.data.kind === 'adapt' ? t.data.swaps.filter((s) => s.override).map((s) => ({ city: t.data.kind === 'adapt' ? t.data.city : '', s })) : []))

  return (
    <div className="min-h-full bg-paper print:bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper/95 px-6 py-3 backdrop-blur print:hidden">
        <Link to={`/c/${c.id}`} className="btn">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to workspace
        </Link>
        <span className="ml-auto" />
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(location.origin + `/r/${c.id}`).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          }}
        >
          <Link2 className="h-3.5 w-3.5" /> {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button className="btn-ink" onClick={() => window.print()}>
          <Download className="h-3.5 w-3.5" /> Download PDF
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 print:px-0 print:py-0">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">Campaign report · {new Date(c.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
        <h1 className="mt-8 font-display text-[52px] font-black uppercase leading-[0.9]">{c.name}</h1>
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-4">
          {[
            ['Product', c.brief.product || '—'],
            ['Audience', c.brief.audience || '—'],
            ['Market', marketOf(c.brief).name],
            ['Budget', c.brief.budget ? money(c.brief.budget, cur) : '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label">{k}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13px] text-ink-2">
          <span className="label mr-2">Cities</span>
          {cities.join(' · ')}
          {!!c.brief.locked?.length && (
            <>
              <span className="label mx-2">Locked</span>
              {c.brief.locked.join(', ')}
            </>
          )}
        </p>

        {originals.length > 0 && (
          <Section title="Fit per city" note="Qloo heatmap affinity of each ad's cultural references, weighted by prominence. Pre-testing, not an A/B result.">
            <table className="w-full border-separate border-spacing-1 text-[13px]">
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
                {[...originals, ...Object.values(c.creatives).filter((x) => x.parentId)].map((cr: Creative) => (
                  <tr key={cr.id}>
                    <td className="max-w-[240px] truncate pr-2 font-medium">{cr.name}</td>
                    {cities.map((x) => {
                      const s = fitOrNull(cr, x)
                      return (
                        <td key={x} className={`rounded py-1.5 text-center ${s === null ? 'bg-paper-2' : CELL[band(s)]}`}>
                          {s === null ? <span className="text-ink-3">—</span> : <Score value={s} size="sm" />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {create && create.data.kind === 'create' && <CreateSection c={c} take={create} />}

        {adapts.map((t) => (t.data.kind === 'adapt' ? <AdaptSection key={t.id} c={c} take={t} /> : null))}

        {spend && spend.data.kind === 'spend' && (
          <Section title={`Starting split · ${money(spend.data.budget, cur)}`} note="Cultural fit × audience size ÷ CPM, with a test floor of up to 10% per city. A starting point, not a forecast: shift budget after 3–5 days of real results.">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left">
                  {['City', 'Share', 'Budget', 'Version', 'Fit', 'Audience'].map((h) => (
                    <th key={h} className="label pb-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {splitBudget(Object.values(c.creatives), spend.data.cities, spend.data.budget, { reach: c.brief.reach, cpm: c.brief.cpm, defaultCpm: defaultCpm(c.brief) })
                  .sort((a, b) => b.amount - a.amount)
                  .map((r) => (
                    <tr key={r.city} className="border-t border-line">
                      <td className="py-1.5 font-medium">
                        {r.city}
                        {r.flag && <span className="ml-2 font-mono text-[10px] uppercase text-fit-low">fix first</span>}
                      </td>
                      <td>{Math.round(r.share * 100)}%</td>
                      <td className="font-semibold">{money(r.amount, cur)}</td>
                      <td className="max-w-[200px] truncate text-ink-2">{c.creatives[r.creativeId]?.name}</td>
                      <td>
                        <Score value={r.fit} size="sm" />
                      </td>
                      <td className="text-ink-2">{r.audience}M</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Section>
        )}

        {deep && deep.data.kind === 'deep' && (
          <Section title="Strategist read" note="Each insight connects two or more Qloo signals: fit, who the ad speaks to, vibe, what its audience also loves, competitors and hotspots. Pre-testing, not a forecast.">
            <p className="font-serif text-[17px] leading-snug">{deep.data.deep.summary}</p>
            <ul className="mt-3 space-y-3">
              {deep.data.deep.insights.map((i, k) => (
                <li key={k} className="break-inside-avoid">
                  <p className="text-[13.5px] font-semibold">{i.headline}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{i.body}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase text-ink-3">{i.kinds.join(' × ')}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {grow && grow.data.kind === 'grow' && (
          <Section title={`Where to grow next${grow.data.home ? ` · from ${grow.data.home}` : ''}`} note="Cities ranked by Qloo fit of the content, weighted by audience size. Not a follower forecast.">
            <div className="space-y-4">
              {grow.data.targets.map((city) => {
                const p = grow.data.kind === 'grow' ? grow.data.plans[city] : undefined
                const cr = grow.data.kind === 'grow' && grow.data.creativeId ? c.creatives[grow.data.creativeId] : undefined
                const s = fitOrNull(cr, city)
                if (!p) return null
                return (
                  <div key={city} className="break-inside-avoid border-t border-line pt-3">
                    <p className="flex items-baseline gap-3">
                      <span className="font-display text-xl font-extrabold uppercase">{city}</span>
                      {s !== null && <Score value={s} size="sm" />}
                      {p.flag && <span className="font-mono text-[10px] uppercase text-fit-low">review before posting</span>}
                    </p>
                    <p className="mt-1 font-serif text-[16px] italic">“{p.hook}”</p>
                    <p className="mt-1 whitespace-pre-line text-[13px]">{p.caption}</p>
                    <p className="mt-1 text-[12.5px] text-ink-2">{p.hashtags.join(' ')}</p>
                    <p className="mt-1 text-[12.5px] text-ink-2">
                      <span className="label mr-1.5">Audio</span>
                      {p.audio}
                      <span className="label mx-1.5">Local touch</span>
                      {p.touch.text}
                      {p.creators.length > 0 && (
                        <>
                          <span className="label mx-1.5">Collab</span>
                          {p.creators.map((x) => `${x.name} (${x.score})`).join(', ')}
                        </>
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {answers.length > 0 && (
          <Section title="Questions answered from Qloo">
            <ul className="space-y-4">
              {answers.map((m) => {
                const i = c.messages.findIndex((x) => x.id === m.id)
                const q = [...c.messages.slice(0, i)].reverse().find((x) => x.role === 'user' && x.text)?.text
                return (
                  <li key={m.id} className="break-inside-avoid">
                    {q && <p className="text-[13px] font-semibold">“{q}”</p>}
                    <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{m.text}</p>
                    <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                      Sources:{' '}
                      {(m.evidenceIds ?? [])
                        .map((e) => c.evidence[e])
                        .filter(Boolean)
                        .map((e) => `${e.title}${e.entities[0] ? ` (${Object.entries(e.entities[0].byCity).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`)
                        .join(' · ')}
                    </p>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        {overrides.length > 0 && (
          <Section title="Sensitivity overrides" note="A human accepted these flagged swaps and logged a reason.">
            <ul className="space-y-2 text-[13px]">
              {overrides.map(({ city, s }) => (
                <li key={s.id}>
                  <strong>{city}:</strong> {s.from} → {s.to}. <span className="text-ink-2">Flag: {s.flag?.reason}</span> <span className="font-mono text-[11px]">Override: “{s.override}”</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <footer className="mt-14 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-3">
          Generated by Action AI. Taste data from Qloo; writing by Gemini and open models. Fit scores are predictions for pre-testing, not
          proof of performance. Budget splits are a starting point, not a forecast. The sensitivity check assists review; it does not certify an ad as safe.
          {c.takes.length > 0 && ` Steps run: ${c.takes.map((t: Take) => metaOf(t.agent).name).join(' → ')}.`}
        </footer>
      </main>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 break-inside-avoid-page">
      <h2 className="border-b-2 border-ink pb-1.5 font-display text-[26px] font-black uppercase leading-none">{title}</h2>
      {note && <p className="mt-2 text-[12px] text-ink-3">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function CreateSection({ c, take }: { c: Campaign; take: Take }) {
  if (take.data.kind !== 'create') return null
  const { cities, master } = take.data
  return (
    <>
      <Section title="What each city loves" note="From Qloo: what each city's audience over-indexes on.">
        <div className="grid gap-5 sm:grid-cols-2">
          {cities
            .filter((x) => c.profiles[x])
            .map((x) => (
              <div key={x} className="break-inside-avoid">
                <p className="font-display text-xl font-black uppercase">{x}</p>
                {c.profiles[x].domains.slice(0, 4).map((d) => (
                  <p key={d.key} className="mt-1 text-[12.5px]">
                    <span className="label mr-1.5">{d.label}</span>
                    {d.items.slice(0, 4).map((i) => i.name).join(' · ')}
                  </p>
                ))}
                {c.writes[x] && (
                  <ol className="mt-2 list-decimal space-y-1 pl-4 font-serif text-[14.5px] leading-snug">
                    {c.writes[x].insights.map((ins, k) => (
                      <li key={k}>{ins.text}</li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
        </div>
      </Section>
      {master && (
        <Section title={`Master script · ${master.title}`}>
          <p className="font-serif text-[17px] leading-relaxed">{master.script}</p>
          {master.post && (
            <p className="mt-4 text-[13px]">
              <span className="label mr-2">Instagram post</span>
              <strong>{master.post.on_image_text}</strong> · {master.post.caption} {master.post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
            </p>
          )}
          {!!master.reels?.length && (
            <ul className="mt-3 space-y-1.5 text-[13px]">
              {master.reels.map((r) => (
                <li key={r.title}>
                  <strong>Reel · {r.title}</strong> ({r.length_seconds}s): {r.hook}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  )
}

function AdaptSection({ c, take }: { c: Campaign; take: Take }) {
  if (take.data.kind !== 'adapt') return null
  const { city, swaps, sourceId, adaptedId } = take.data
  const accepted = swaps.filter((s) => s.status === 'accepted')
  if (!swaps.length) return null
  const before = fitOrNull(c.creatives[sourceId], city)
  const after = fitOrNull(c.creatives[adaptedId], city)
  return (
    <Section title={`Adapted for ${city}`} note={`Fit in ${city}: ${before ?? '—'} → ${after ?? '—'} with ${accepted.length} of ${swaps.length} swaps accepted.`}>
      <ul className="space-y-2.5 text-[13px]">
        {swaps.map((s) => (
          <li key={s.id} className={`break-inside-avoid ${s.status === 'accepted' ? '' : 'opacity-50'}`}>
            <span className="line-through decoration-fit-low">{s.from}</span> → <strong>{s.to}</strong>{' '}
            <span className="font-mono text-[11px] text-ink-3">
              ({s.status}, {s.toScore} in {city})
            </span>
            <p className="text-[12.5px] text-ink-2">{s.why}</p>
          </li>
        ))}
      </ul>
      {c.creatives[adaptedId] && (
        <p className="mt-4 rounded-md bg-paper-2 p-3 font-serif text-[15px] leading-relaxed print:bg-white">
          <span className="label mr-2">The {city} version</span>
          {c.creatives[adaptedId].text}
        </p>
      )}
    </Section>
  )
}
