import { Check, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { buildAdapted } from '../../lib/engine/reader'
import { fitScore, homeCity } from '../../lib/engine/scoring'
import { useStore } from '../../lib/store'
import { marketOf } from '../../lib/regions'
import type { Campaign, City, Creative, Swap, Take } from '../../lib/types'
import { FitBar, Footnote, Score } from '../ui'
import { Mockup } from './Mockup'
import { Panel, segments } from './shared'

const sentenceOf = (text: string, phrase: string) =>
  text.split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(phrase.toLowerCase())) ?? phrase

export function AdaptView({ c, take }: { c: Campaign; take: Take }) {
  if (take.data.kind !== 'adapt') return null
  const { sourceId, adaptedId, city, swaps } = take.data
  const source = c.creatives[sourceId]
  const adapted = c.creatives[adaptedId]
  if (!source) return null
  if (!swaps.length || !adapted)
    return (
      <Panel title={`Adapt · ${city}`}>
        <p className="text-[14px]">
          Nothing to swap for {city}. This ad already fits at <Score value={fitScore(source, city)} size="sm" />, or Qloo found no stronger local equivalent.
        </p>
      </Panel>
    )

  const before = fitScore(source, city)
  const now = fitScore(adapted, city)
  const potential = fitScore(buildAdapted(source, swaps.map((s) => ({ ...s, status: 'accepted' })), city, 'x'), city)
  const home = c.brief.sourceCity ? { city: c.brief.sourceCity, score: fitScore(source, c.brief.sourceCity) } : homeCity(source, Array.from(new Set([...marketOf(c.brief).cities, ...c.brief.cities])))
  const counts = { accepted: 0, pending: 0, rejected: 0 }
  swaps.forEach((s) => counts[s.status]++)
  const timed = source.format === 'video' || source.format === 'reel'

  return <AdaptInner {...{ c, take, source, adapted, city, swaps, before, now, potential, home, counts, timed }} />
}

function AdaptInner({
  c,
  take,
  source,
  adapted,
  city,
  swaps,
  before,
  now,
  potential,
  home,
  counts,
  timed,
}: {
  c: Campaign
  take: Take
  source: Creative
  adapted: Creative
  city: City
  swaps: Swap[]
  before: number
  now: number
  potential: number
  home: { city: City; score: number }
  counts: Record<Swap['status'], number>
  timed: boolean
}) {
  const update = useStore((s) => s.updateSwap)
  const acceptClear = () => swaps.filter((s) => s.status === 'pending' && !s.flag).forEach((s) => update(c.id, take.id, s.id, { status: 'accepted' }))

  if (!swaps.length)
    return (
      <Panel title={`Adapt · ${city}`}>
        <p className="text-[14px]">
          This ad already fits {city} at <Score value={before} size="sm" />. No reference needs swapping.
        </p>
      </Panel>
    )

  return (
    <div className="space-y-5">
      {/* the meter */}
      <div className="card flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        <div>
          <p className="label">Route</p>
          <p className="mt-1 font-display text-3xl font-black uppercase leading-none">
            {home.city} <span className="text-ink-3">→</span> {city}
          </p>
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-end gap-3">
            <div>
              <p className="label">Before</p>
              <Score value={before} size="lg" />
            </div>
            <span className="pb-1 font-mono text-ink-3">━━▶</span>
            <div>
              <p className="label">Now</p>
              <Score value={now} size="xl" />
            </div>
            <div className="ml-auto text-right">
              <p className="label">If all accepted</p>
              <span className="font-display text-2xl font-extrabold text-ink-3">{potential}</span>
            </div>
          </div>
          <div className="mt-2.5">
            <FitBar value={now} ghost={potential} />
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-ink-2">
          <span>{counts.accepted} accepted</span>
          <span>{counts.pending} pending</span>
          <span>{counts.rejected} rejected</span>
          <button data-tour="accept-clear" onClick={acceptClear} disabled={!swaps.some((s) => s.status === 'pending' && !s.flag)} className="btn disabled:opacity-40">
            Accept all clear swaps
          </button>
        </div>
      </div>

      <section data-tour="see-it" className="card p-4">
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="label text-ink-2">See it · {home.city} cut vs {city} cut</h3>
          <span className="ml-auto font-mono text-[10px] text-ink-3">AI mock-ups from each version&apos;s text · accept swaps first</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Mockup label={`Before · ${home.city}`} text={source.text} city={home.city} kind="video ad, key frame" aspect="16:9" tourId="mock-before" />
          <Mockup key={adapted.text} tourId="mock-after" label={`After · ${city}`} text={adapted.text} city={city} kind="video ad, key frame" aspect="16:9" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3">
          {swaps.map((s, i) => (
            <SwapCard key={s.id} n={i + 1} s={s} sentence={sentenceOf(source.text, s.from)} onPatch={(p) => update(c.id, take.id, s.id, p)} />
          ))}
        </div>

        <div className="space-y-5">
          <Panel title={`The ${city} version`} right={<Score value={now} size="sm" />}>
            <p className="font-serif text-[18px] leading-[1.6]">
              {segments(adapted.text, adapted.refs.filter((r) => r.id.includes('~'))).map((seg, i) =>
                'ref' in seg ? (
                  <mark key={i} className="rounded-[3px] bg-fit-high/15 px-0.5 text-ink underline decoration-fit-high decoration-2 underline-offset-4">
                    {seg.t}
                  </mark>
                ) : (
                  <span key={i}>{seg.t}</span>
                ),
              )}
            </p>
            <p className="mt-3 font-mono text-[10.5px] text-ink-3">Updates as you accept swaps. Nothing ships without your approval.</p>
          </Panel>
          {timed && (
            <Panel title="Reshoot and edit list">
              <ul className="space-y-2 text-[13px]">
                {swaps
                  .filter((s) => s.status === 'accepted')
                  .map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <span className="w-[72px] shrink-0 font-mono text-[11px] text-ink-3">{s.at ?? '—'}</span>
                      <span>Replace {s.from.toLowerCase()} with {s.to}.</span>
                    </li>
                  ))}
                {!counts.accepted && <li className="text-ink-3">Accept swaps to build the list.</li>}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function SwapCard({ n, s, sentence, onPatch }: { n: number; s: Swap; sentence: string; onPatch: (p: Partial<Swap>) => void }) {
  const [overriding, setOverriding] = useState(false)
  const [reason, setReason] = useState('')
  const blocked = !!s.flag && !s.override
  const idx = sentence.toLowerCase().indexOf(s.from.toLowerCase())
  const pre = idx >= 0 ? sentence.slice(0, idx) : ''
  const post = idx >= 0 ? sentence.slice(idx + s.from.length) : ''

  const tone =
    s.status === 'accepted' ? 'border-fit-high/60 bg-fit-high/[0.04]' : s.status === 'rejected' ? 'border-line opacity-55' : blocked ? 'border-fit-low/60' : 'border-line'

  return (
    <article className={`rise rounded-lg border bg-paper-3 shadow-card transition ${tone}`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="font-mono text-[10px] text-ink-3">SWAP {String(n).padStart(2, '0')}</span>
        {s.at && <span className="font-mono text-[10px] text-ink-3">· {s.at}</span>}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-3">
          {s.status === 'pending' ? (blocked ? 'Needs a human call' : 'Pending') : s.status}
        </span>
      </div>

      <div className="px-4 py-3">
        <p className="font-serif text-[18px] leading-[1.55]">
          {pre}
          <del className="rounded-[2px] bg-fit-low/10 text-ink-2 decoration-fit-low decoration-2">{s.from}</del>{' '}
          <ins className="rounded-[2px] bg-fit-high/15 text-ink no-underline">{s.to}</ins>
          {post}
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
          {s.why}
          <Footnote n={n} evidenceId={s.evidenceId} />
        </p>
        {s.vibe && (s.vibe.from.length > 0 || s.vibe.to.length > 0) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-ink-3" title="Qloo style and theme tags that set each side apart">
            Vibe: <span className="text-ink-2">{s.vibe.from.slice(0, 3).join(', ') || '—'}</span> → <span className="text-ink">{s.vibe.to.slice(0, 3).join(', ') || '—'}</span>
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-ink-3">This reference in the target city</span>
          <Score value={s.toScore} size="sm" />
        </div>

        {s.flag && (
          <div data-tour="flag" className={`mt-3 rounded-md border px-3 py-2.5 ${s.override ? 'border-line bg-paper' : 'border-fit-low/50 bg-fit-low/[0.06]'}`}>
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fit-low">
              <ShieldAlert className="h-3.5 w-3.5" /> Sensitivity check
            </p>
            <p className="mt-1 text-[13px]">{s.flag.reason}</p>
            {s.override ? (
              <p className="mt-1.5 font-mono text-[11px] text-ink-2">Overridden: “{s.override}” (logged to the campaign)</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {s.flag.safer && (
                  <>
                    <button data-tour="safer" onClick={() => onPatch({ to: s.flag!.safer, flag: undefined, why: `${s.why} Safer wording chosen after a sensitivity flag.` })} className="btn-ink">
                      Use safer option
                    </button>
                    <span className="text-[12px] text-ink-3">“{s.flag.safer}”</span>
                  </>
                )}
                {!overriding ? (
                  <button onClick={() => setOverriding(true)} className="ml-auto text-[12px] font-medium underline underline-offset-2">
                    Override
                  </button>
                ) : (
                  <form
                    className="flex w-full gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (reason.trim().length >= 8) onPatch({ override: reason.trim() })
                    }}
                  >
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this safe here? (logged)"
                      className="flex-1 rounded border border-line bg-paper-3 px-2 py-1 text-[12.5px] focus:border-ink focus:outline-none"
                    />
                    <button disabled={reason.trim().length < 8} className="btn disabled:opacity-40">
                      Log override
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <span className="ml-auto" />
          <button
            onClick={() => onPatch({ status: s.status === 'rejected' ? 'pending' : 'rejected' })}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition ${s.status === 'rejected' ? 'border-ink bg-ink text-chalk' : 'border-line hover:border-ink'}`}
          >
            <X className="h-3.5 w-3.5" /> Reject
          </button>
          <button
            disabled={blocked}
            title={blocked ? 'Resolve the sensitivity flag first' : undefined}
            onClick={() => onPatch({ status: s.status === 'accepted' ? 'pending' : 'accepted' })}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
              s.status === 'accepted' ? 'border-fit-high bg-fit-high text-white' : 'border-ink hover:bg-ink hover:text-chalk'
            }`}
          >
            <Check className="h-3.5 w-3.5" /> {s.status === 'accepted' ? 'Accepted' : 'Accept'}
          </button>
        </div>
      </div>
    </article>
  )
}
