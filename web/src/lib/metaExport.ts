// "Download for Meta Ads Manager": one ad set per city with its starting budget, location, age range, interests and the
// version of the ad that fits that city best. A head start for Ads Manager's bulk import, not a live push: Meta's interest
// names must match its own list, so the team reviews the file before importing.
import { splitBudget } from './engine/scoring'
import { countryOfCity, currencyOf, defaultCpm } from './regions'
import type { Campaign } from './types'

const csvCell = (v: string | number) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function ages(audience?: string): [number, number] {
  const m = (audience ?? '').replace('–', '-').match(/(\d+)\s*-\s*(\d+)/)
  if (m) return [Math.max(13, +m[1]), Math.min(65, +m[2])]
  const plus = (audience ?? '').match(/(\d+)\s*\+/)
  return plus ? [+plus[1], 65] : [18, 65]
}

export function metaCsv(c: Campaign, cities: string[], budget: number): string {
  const creatives = Object.values(c.creatives)
  const rows = splitBudget(creatives, cities, budget, { reach: c.brief.reach, cpm: c.brief.cpm, defaultCpm: defaultCpm(c.brief) })
  const [ageMin, ageMax] = ages(c.brief.audience)
  const campaign = `${c.brief.brand || c.name} · Action AI starting split`
  const cur = currencyOf(c.brief)
  const header = [
    'Campaign Name', 'Campaign Objective', 'Ad Set Name', 'Ad Set Lifetime Budget', 'Currency', 'Countries', 'Cities',
    'Age Min', 'Age Max', 'Interests (check in Ads Manager)', 'Ad Name', 'Body', 'Action AI fit score', 'Notes',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const r of [...rows].sort((a, b) => b.amount - a.amount)) {
    const cr = c.creatives[r.creativeId]
    const prof = c.profiles[r.city]
    const interests = prof
      ? prof.domains.filter((d) => ['music', 'film', 'tv', 'brands'].includes(d.key)).flatMap((d) => d.items.slice(0, 2).map((i) => i.name))
      : []
    const body = (cr?.text ?? '').replace(/\s+/g, ' ').slice(0, 500)
    lines.push(
      [
        campaign, 'Awareness', `${r.city} · 18+`.replace('18+', `${ageMin}-${ageMax}`), r.amount, cur, countryOfCity(r.city) ?? '', r.city,
        ageMin, ageMax, interests.join('; '), cr?.name ?? '', body, r.fit,
        r.flag ? 'Fix before you spend: weak fit for a large audience' : 'Starting split; shift after 3-5 days of results',
      ].map(csvCell).join(','),
    )
  }
  return lines.join('\n')
}

export function downloadMetaCsv(c: Campaign, cities: string[], budget: number) {
  const blob = new Blob(['﻿' + metaCsv(c, cities, budget)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(c.brief.brand || c.name).replace(/[^\w-]+/g, '_').slice(0, 40)}_meta_ads.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
