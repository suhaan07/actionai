import { audienceOf, money } from '../regions'
import type { City, Creative, Prominence, Reference } from '../types'

const WEIGHT: Record<Prominence, number> = { hero: 3, support: 2, background: 1 }

export const scorable = (r: Reference) => r.enabled && r.kind !== 'unmatched'

/** Weighted mean of the references' Qloo scores in a region. Null when nothing is scorable there. */
export function fitOrNull(c: Creative | undefined, city: City): number | null {
  if (!c) return null
  let sum = 0
  let w = 0
  for (const r of c.refs) {
    const s = r.scores[city]
    if (!scorable(r) || s === undefined) continue
    sum += s * WEIGHT[r.prominence]
    w += WEIGHT[r.prominence]
  }
  return w ? Math.round(sum / w) : null
}

export const fitScore = (c: Creative | undefined, city: City) => fitOrNull(c, city) ?? 0

export type Band = 'low' | 'mid' | 'high'
export const band = (s: number): Band => (s < 50 ? 'low' : s < 70 ? 'mid' : 'high')

export const BAND_TEXT: Record<Band, string> = {
  low: 'text-fit-low',
  mid: 'text-fit-mid',
  high: 'text-fit-high',
}
export const BAND_BG: Record<Band, string> = {
  low: 'bg-fit-low',
  mid: 'bg-fit-mid',
  high: 'bg-fit-high',
}

/** Highest-scoring region: what the creative "reads as". */
export function homeCity(c: Creative, cities: readonly City[]): { city: City; score: number } {
  let best = { city: cities[0], score: -1 }
  for (const city of cities) {
    const s = fitOrNull(c, city)
    if (s !== null && s > best.score) best = { city, score: s }
  }
  return best
}

export interface SplitRow {
  city: City
  creativeId: string
  fit: number
  audience: number
  cpm: number
  share: number
  amount: number
  flag: boolean
}

export const DEFAULT_CPM = 120 // INR; other markets pass their own via opts.defaultCpm

/** Starting split: fit² × audience ÷ CPM, with a 10% floor per region. Not a forecast. */
export function splitBudget(
  creatives: Creative[],
  cities: City[],
  budget: number,
  opts: { reach?: Record<string, number>; cpm?: Record<string, number>; defaultCpm?: number } = {},
  minShare = 0.1,
): SplitRow[] {
  if (!cities.length || !creatives.length) return []
  const rows = cities.map((city) => {
    let best = { id: creatives[0].id, fit: -1 }
    for (const c of creatives) {
      const f = fitScore(c, city)
      if (f > best.fit) best = { id: c.id, fit: f }
    }
    return { city, creativeId: best.id, fit: best.fit, audience: audienceOf(city, opts.reach), cpm: opts.cpm?.[city] ?? opts.defaultCpm ?? DEFAULT_CPM }
  })
  const floor = cities.length * minShare <= 1 ? minShare : 1 / cities.length
  const base = opts.defaultCpm ?? DEFAULT_CPM
  const weights = rows.map((r) => ((r.fit / 100) ** 2 * r.audience) / (r.cpm / base))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const rest = 1 - floor * cities.length
  return rows.map((r, i) => {
    const share = floor + rest * (weights[i] / total)
    return {
      ...r,
      share,
      amount: Math.round((budget * share) / 500) * 500,
      flag: r.audience >= 3.5 && r.fit < 50,
    }
  })
}

/** @deprecated use money(n, currency) */
export const inr = (n: number) => money(n, 'INR')
