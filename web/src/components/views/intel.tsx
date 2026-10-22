// Small pieces for the deeper Qloo signals: who a reference speaks to, how mainstream a pick is, the vibe gap, and hotspots.
import type { IntelItem, Skew } from '../../lib/types'

export const BANDS: [string, string][] = [
  ['24_and_younger', '18–24'],
  ['25_to_29', '25–29'],
  ['30_to_34', '30–34'],
  ['35_to_44', '35–44'],
  ['45_to_54', '45–54'],
  ['55_and_older', '55+'],
]

/** Age bands the brief's audience covers, e.g. '18–24' → ['24_and_younger']. */
export function targetBands(audience?: string | null): string[] {
  const m = (audience ?? '').replace('–', '-').replace('+', '-99').match(/(\d+)\s*-\s*(\d+)/)
  if (!m) return []
  const [lo, hi] = [Number(m[1]), Number(m[2])]
  const spans: Record<string, [number, number]> = { '24_and_younger': [0, 24], '25_to_29': [25, 29], '30_to_34': [30, 34], '35_to_44': [35, 44], '45_to_54': [45, 54], '55_and_older': [55, 120] }
  return Object.entries(spans).filter(([, [a, b]]) => a <= hi && b >= lo).map(([k]) => k)
}

/** One-line reading of a skew, e.g. "25–29 · male". */
export function skewLine(s: Skew): string {
  const top = BANDS.reduce((best, [k]) => ((s.age[k] ?? -9) > (s.age[best] ?? -9) ? k : best), BANDS[0][0])
  const male = s.gender.male ?? 0
  return `${BANDS.find(([k]) => k === top)![1]} · ${Math.abs(male) < 0.15 ? 'gender-even' : male > 0 ? 'male' : 'female'}`
}

/** Diverging bars: each age band's over/under-index (−1…1), target bands outlined, plus a gender bar. */
export function SkewChart({ skew, target = [], compact = false }: { skew: Skew; target?: string[]; compact?: boolean }) {
  const male = skew.gender.male ?? 0
  return (
    <div>
      <ul className={compact ? 'space-y-0.5' : 'space-y-1'}>
        {BANDS.map(([k, label]) => {
          const v = skew.age[k] ?? 0
          const on = target.includes(k)
          return (
            <li key={k} className="grid grid-cols-[44px_1fr_34px] items-center gap-2">
              <span className={`font-mono text-[10px] ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}>{label}</span>
              <span className={`relative h-2.5 rounded-sm bg-paper-2 ${on ? 'ring-1 ring-ink' : ''}`}>
                <span className="absolute inset-y-0 left-1/2 w-px bg-ink/30" />
                <span
                  className={`absolute inset-y-0 rounded-sm ${v >= 0 ? 'bg-fit-high' : 'bg-fit-low/70'}`}
                  style={v >= 0 ? { left: '50%', width: `${Math.min(1, v) * 50}%` } : { right: '50%', width: `${Math.min(1, -v) * 50}%` }}
                />
              </span>
              <span className="text-right font-mono text-[10px] tabular-nums text-ink-2">{v > 0 ? '+' : ''}{v.toFixed(2)}</span>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 grid grid-cols-[44px_1fr_34px] items-center gap-2">
        <span className="font-mono text-[10px] text-ink-3">F · M</span>
        <span className="relative h-2.5 rounded-sm bg-paper-2">
          <span className="absolute inset-y-0 left-1/2 w-px bg-ink/30" />
          <span className="absolute inset-y-0 rounded-sm bg-ink/70" style={male >= 0 ? { left: '50%', width: `${Math.min(1, male) * 50}%` } : { right: '50%', width: `${Math.min(1, -male) * 50}%` }} />
        </span>
        <span className="text-right font-mono text-[10px] tabular-nums text-ink-2">{Math.abs(male) < 0.15 ? 'even' : male > 0 ? 'M' : 'F'}</span>
      </div>
    </div>
  )
}

/** Match of a skew with the target audience: mean over the target's bands. */
export function matchOf(skew: Skew | null | undefined, target: string[]): number | null {
  if (!skew || !target.length) return null
  return Math.round((target.reduce((a, b) => a + (skew.age[b] ?? 0), 0) / target.length) * 100) / 100
}

export function MatchBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const tone = value >= 0.15 ? 'border-fit-high/50 text-fit-high' : value <= -0.15 ? 'border-fit-low/50 text-fit-low' : 'border-line-2 text-ink-2'
  const word = value >= 0.15 ? 'Leans toward your audience' : value <= -0.15 ? 'Leans away from your audience' : 'Neutral for your audience'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}>
      {word} · {value > 0 ? '+' : ''}
      {value.toFixed(2)}
    </span>
  )
}

/** How mainstream a Qloo pick is (popularity 0–1). */
export function PopBadge({ value }: { value?: number | null }) {
  if (value === undefined || value === null) return null
  const [word, tone] = value < 0.4 ? ['Niche', 'text-fit-high border-fit-high/40'] : value < 0.85 ? ['Known', 'text-ink-2 border-line-2'] : ['Mainstream', 'text-ink-3 border-line']
  return <span className={`rounded border px-1 font-mono text-[9px] uppercase tracking-wider ${tone}`} title={`Qloo popularity ${value}`}>{word}</span>
}

/** A ranked list of Qloo picks with their affinity and how mainstream they are. */
export function ItemList({ items, empty = 'Nothing distinctive here.' }: { items: IntelItem[]; empty?: string }) {
  if (!items.length) return <p className="text-[12px] text-ink-3">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {items.map((i, j) => (
        <li key={`${i.id}-${j}`} className="flex items-center gap-2 text-[13px]" title={i.about || undefined}>
          <span className="w-7 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-ink-3">{i.affinity != null ? Math.round(i.affinity * 100) : '—'}</span>
          <span className="min-w-0 truncate font-medium">{i.name}</span>
          <span className="ml-auto shrink-0">
            <PopBadge value={i.popularity} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function VibeGap({ ad, city, cityName }: { ad: string[]; city: string[]; cityName: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-[12.5px]">
      <div>
        <p className="label mb-1">Your ad reads as</p>
        <div className="flex flex-wrap gap-1">{ad.length ? ad.map((t, j) => <span key={`${t}-${j}`} className="rounded bg-ink px-1.5 py-0.5 text-[11px] text-chalk">{t}</span>) : <span className="text-ink-3">—</span>}</div>
      </div>
      <div>
        <p className="label mb-1">{cityName} favours</p>
        <div className="flex flex-wrap gap-1">{city.length ? city.map((t, j) => <span key={`${t}-${j}`} className="rounded border border-ink px-1.5 py-0.5 text-[11px]">{t}</span>) : <span className="text-ink-3">—</span>}</div>
      </div>
    </div>
  )
}

/** Heatmap cells inside a city, drawn to scale around its centre, with the loved places pinned. */
export function HotspotMap({ center, radiusKm, cells, places }: { center: [number, number]; radiusKm: number; cells: [number, number, number][]; places: IntelItem[] }) {
  const W = 260
  const kmLat = 111
  const kmLon = 111 * Math.cos((center[0] * Math.PI) / 180)
  const xy = (lat: number, lon: number) => [W / 2 + (((lon - center[1]) * kmLon) / radiusKm) * (W / 2), W / 2 - (((lat - center[0]) * kmLat) / radiusKm) * (W / 2)]
  const max = Math.max(...cells.map((c) => c[2]), 0.01)
  const min = Math.min(...cells.map((c) => c[2]))
  const cell = Math.max(8, (W / (radiusKm * 2)) * 9)
  const pins = places.filter((p) => p.lat !== undefined && p.lon !== undefined).map((p) => ({ p, at: xy(p.lat!, p.lon!) })).filter(({ at }) => at[0] > 4 && at[0] < W - 4 && at[1] > 4 && at[1] < W - 4)
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="w-full max-w-[260px] rounded-md border border-line bg-paper" role="img" aria-label="Where in the city the ad's hero reference is strongest">
      <circle cx={W / 2} cy={W / 2} r={W / 2 - 2} fill="none" stroke="currentColor" className="text-line-2" strokeDasharray="3 4" />
      {cells.map(([lat, lon, a], i) => {
        const [x, y] = xy(lat, lon)
        const t = max === min ? 1 : (a - min) / (max - min)
        return <rect key={i} x={x - cell / 2} y={y - cell / 2} width={cell} height={cell} rx={2} className="fill-fit-high" opacity={0.12 + t * 0.75} />
      })}
      {pins.map(({ p, at }, j) => (
        <g key={`${p.id}-${j}`}>
          <circle cx={at[0]} cy={at[1]} r={3.5} className="fill-ink" />
          <title>{p.name}</title>
        </g>
      ))}
    </svg>
  )
}
