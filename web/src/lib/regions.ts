import type { Brief } from './types'

export type Currency = 'INR' | 'USD' | 'GBP' | 'EUR'

export interface Market {
  name: string
  cities: string[]
  more: string[]
  currency: Currency
  /** rough default CPM in the market's currency */
  cpm: number
}

/** Preset markets. Any other city or town worldwide can be added by name; Qloo resolves it. */
export const MARKETS: Record<string, Market> = {
  India: {
    name: 'India',
    cities: ['Delhi', 'Mumbai', 'Chennai', 'Bengaluru', 'Kolkata', 'Lucknow'],
    more: ['Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Patna', 'Kochi'],
    currency: 'INR',
    cpm: 120,
  },
  'United States': {
    name: 'United States',
    cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Atlanta', 'Miami'],
    more: ['San Francisco', 'Austin', 'Nashville'],
    currency: 'USD',
    cpm: 9,
  },
  'United Kingdom': {
    name: 'United Kingdom',
    cities: ['London', 'Manchester', 'Birmingham', 'Glasgow', 'Bristol'],
    more: [],
    currency: 'GBP',
    cpm: 7,
  },
}

const COUNTRY_OF: Record<string, string> = Object.fromEntries(
  Object.values(MARKETS).flatMap((m) => [...m.cities, ...m.more].map((c) => [c, m.name])),
)

/** Default 18–34 audience (millions) per preset city. Rough public estimates; teams override with Meta's reach. */
export const AUDIENCE: Record<string, number> = {
  Delhi: 9.1, Mumbai: 8.2, Chennai: 3.9, Bengaluru: 4.8, Kolkata: 4.6, Lucknow: 1.4,
  Hyderabad: 3.6, Pune: 2.5, Ahmedabad: 2.6, Jaipur: 1.5, Patna: 0.9, Kochi: 0.8,
  'New York': 4.6, 'Los Angeles': 3.1, Chicago: 2.1, Houston: 1.7, Atlanta: 1.4, Miami: 1.3, 'San Francisco': 1.8, Austin: 0.6, Nashville: 0.5,
  London: 2.4, Manchester: 0.7, Birmingham: 0.7, Glasgow: 0.4, Bristol: 0.3,
}
export const UNKNOWN_AUDIENCE = 1

export const audienceOf = (city: string, reach?: Record<string, number>) => reach?.[city] ?? AUDIENCE[city] ?? UNKNOWN_AUDIENCE

/** The campaign's market: set explicitly, or inferred from its cities. India when nothing says otherwise. */
export function marketOf(brief?: Partial<Brief>): Market {
  if (brief?.market && MARKETS[brief.market]) return MARKETS[brief.market]
  const seen = (brief?.cities ?? []).map((c) => COUNTRY_OF[c]).filter(Boolean)
  if (seen.length) {
    const top = seen.sort((a, b) => seen.filter((x) => x === b).length - seen.filter((x) => x === a).length)[0]
    return MARKETS[top]
  }
  if (brief?.market) return { name: brief.market, cities: [], more: [], currency: brief.currency ?? 'USD', cpm: 9 }
  return MARKETS.India
}

export const currencyOf = (brief?: Partial<Brief>): Currency => brief?.currency ?? marketOf(brief).currency
export const defaultCpm = (brief?: Partial<Brief>) => (brief?.currency && brief.currency !== marketOf(brief).currency ? { INR: 120, USD: 9, GBP: 7, EUR: 8 }[brief.currency] : marketOf(brief).cpm)

export const ALL_PRESETS = Object.values(MARKETS).flatMap((m) => [...m.cities, ...m.more])
export const countryOfCity = (c: string) => COUNTRY_OF[c]

const SYMBOL: Record<Currency, string> = { INR: '₹', USD: '$', GBP: '£', EUR: '€' }
export const symbolOf = (c: Currency) => SYMBOL[c]

/** ₹2.5L / ₹1.2Cr for INR; $250K / $1.2M elsewhere. */
export function money(n: number, currency: Currency = 'INR'): string {
  const s = SYMBOL[currency]
  if (currency === 'INR') return n >= 1e7 ? `${s}${+(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `${s}${+(n / 1e5).toFixed(2)}L` : `${s}${Math.round(n / 1000)}K`
  return n >= 1e6 ? `${s}${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${s}${Math.round(n / 1000)}K` : `${s}${Math.round(n)}`
}

/** A sensible example budget per currency, for chips and defaults. */
export const exampleBudget = (c: Currency) => ({ INR: 200000, USD: 50000, GBP: 40000, EUR: 45000 })[c]

/** A neutral sample script for trying the agents without an ad of your own. */
export const SAMPLE_SCRIPT =
  'Open on a Punjabi wedding sangeet, the whole family on the dance floor, mehendi still drying on every hand. ' +
  'A dhol-heavy Punjabi pop track kicks in. Midnight: the cousins sneak out to an Old Delhi chaat stall. ' +
  'Cut to a Bollywood dance montage as the night peaks. Back inside, the elders bless the couple while the product is passed from hand to hand. ' +
  'SUPER: Made for every celebration.'
