import type { ReactNode } from 'react'
import { band } from '../../lib/engine/scoring'
import type { City, Creative, Reference } from '../../lib/types'

const HL: Record<string, string> = {
  low: 'bg-fit-low/15 decoration-fit-low',
  mid: 'bg-fit-mid/15 decoration-fit-mid',
  high: 'bg-fit-high/15 decoration-fit-high',
  off: 'bg-ink/5 decoration-ink/30',
}

/** Splits text into plain runs and reference highlights (first occurrence of each). */
export function segments(text: string, refs: Reference[]) {
  const hits: { start: number; end: number; ref: Reference }[] = []
  for (const r of refs) {
    const at = text.toLowerCase().indexOf(r.text.toLowerCase())
    if (at < 0) continue
    if (hits.some((h) => at < h.end && at + r.text.length > h.start)) continue
    hits.push({ start: at, end: at + r.text.length, ref: r })
  }
  hits.sort((a, b) => a.start - b.start)
  const out: ({ t: string } | { t: string; ref: Reference })[] = []
  let i = 0
  for (const h of hits) {
    if (h.start > i) out.push({ t: text.slice(i, h.start) })
    out.push({ t: text.slice(h.start, h.end), ref: h.ref })
    i = h.end
  }
  if (i < text.length) out.push({ t: text.slice(i) })
  return out
}

export function HighlightedScript({
  creative,
  city,
  onRef,
  activeRef,
}: {
  creative: Creative
  city?: City
  onRef?: (r: Reference) => void
  activeRef?: string
}) {
  return (
    <p className="font-serif text-[21px] leading-[1.6] text-ink">
      {segments(creative.text, creative.refs).map((s, i) => {
        if (!('ref' in s)) return <span key={i}>{s.t}</span>
        const r = s.ref
        const score = city ? r.scores[city] : undefined
        const tone = !r.enabled || r.kind === 'unmatched' || score === undefined ? 'off' : band(score)
        return (
          <button
            key={i}
            data-band={tone}
            onClick={() => onRef?.(r)}
            className={`relative rounded-[3px] px-0.5 underline decoration-2 underline-offset-[5px] transition-colors duration-500 ${HL[tone]} ${activeRef === r.id ? 'ring-1 ring-ink' : ''}`}
            title={score !== undefined ? `${r.label}: ${score} in ${city}` : r.label}
          >
            {s.t}
            {score !== undefined && r.enabled && (
              <sup className="ml-0.5 font-mono text-[10px] font-semibold not-italic no-underline">{score}</sup>
            )}
          </button>
        )
      })}
    </p>
  )
}

const parseT = (at?: string | null) => {
  if (!at) return [0, 0]
  const [a, b] = at.split('–').map((x) => {
    const [m, s] = x.split(':').map(Number)
    return m * 60 + s
  })
  return [a, b ?? a + 2]
}

/** Timeline for video and Reels: each cue sits where it appears, coloured by fit. */
export function Timeline({ creative, city, length = 24 }: { creative: Creative; city?: City; length?: number }) {
  const refs = creative.refs.filter((r) => r.at)
  if (!refs.length) return null
  return (
    <div>
      <div className="relative h-[86px] rounded-md bg-ink p-2">
        <div className="absolute inset-x-2 top-2 flex justify-between font-mono text-[9px] text-chalk-3">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i}>0:{String(Math.round((i * length) / 6)).padStart(2, '0')}</span>
          ))}
        </div>
        {refs.map((r, i) => {
          const [a, b] = parseT(r.at)
          const s = city ? r.scores[city] : undefined
          const tone = !r.enabled || r.kind === 'unmatched' || s === undefined ? 'bg-chalk/25' : { low: 'bg-fit-low', mid: 'bg-fit-mid', high: 'bg-fit-high' }[band(s)]
          return (
            <div
              key={r.id}
              className={`absolute h-3.5 rounded-sm ${tone} transition-colors duration-500`}
              style={{ left: `calc(${(a / length) * 100}% + 8px)`, width: `calc(${((b - a) / length) * 100}% - 4px)`, top: 22 + (i % 3) * 19 }}
              title={`${r.at} · ${r.label}`}
            >
              <span className="absolute left-1 top-1/2 -translate-y-1/2 truncate whitespace-nowrap font-mono text-[9px] font-semibold text-ink">{r.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Panel({
  title,
  right,
  children,
  className = '',
  'data-tour': demo,
}: {
  title: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  'data-tour'?: string
}) {
  return (
    <section data-tour={demo} className={`card ${className}`}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h3 className="label text-ink-2">{title}</h3>
        <span className="ml-auto">{right}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export const KIND_LABEL: Record<Reference['kind'], string> = { entity: 'Qloo entity', tag: 'Qloo genre tag', proxy: 'Via Qloo proxies', unmatched: 'No Qloo match' }
export const SOURCE_LABEL: Record<Reference['source'], string> = { script: 'Script', visual: 'Visual', audio: 'Audio', caption: 'Caption' }
