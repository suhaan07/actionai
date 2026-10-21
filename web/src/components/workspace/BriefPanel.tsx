import { ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../lib/api'
import { countryOfCity, currencyOf, marketOf, MARKETS, money, symbolOf } from '../../lib/regions'
import { useStore } from '../../lib/store'
import type { Campaign, City } from '../../lib/types'

/** The brief, styled as a call sheet. Filled by the agents' questions; editable any time. */
export function BriefPanel({ c }: { c: Campaign }) {
  const [open, setOpen] = useState(false)
  const update = useStore((s) => s.updateBrief)
  const b = c.brief
  const market = marketOf(b)
  const options = Array.from(new Set([...market.cities, ...b.cities, ...market.more]))
  const toggleCity = (city: City) =>
    update(c.id, { cities: b.cities.includes(city) ? b.cities.filter((x) => x !== city) : options.filter((x) => x === city || b.cities.includes(x)) })
  const [place, setPlace] = useState('')
  const [placeMsg, setPlaceMsg] = useState('')
  const addPlace = async () => {
    const q = place.trim()
    if (!q) return
    setPlaceMsg('Checking Qloo…')
    try {
      const r = await api.resolveRegion(q)
      update(c.id, { cities: Array.from(new Set([...b.cities, r.name])) })
      setPlace('')
      setPlaceMsg('')
    } catch (e) {
      setPlaceMsg(e instanceof Error ? e.message : 'Not found')
    }
  }

  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="label text-ink-2">Call sheet</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
          {[b.audience, b.cities.join(' · '), b.budget ? money(b.budget, currencyOf(b)) : ''].filter(Boolean).join('  /  ') || 'Filled in as the agents ask'}
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="rise grid grid-cols-[84px_1fr] items-center gap-x-3 gap-y-2.5 px-4 pb-4 text-[13px]">
          <Label>Product</Label>
          <input
            value={b.product}
            onChange={(e) => update(c.id, { product: e.target.value })}
            placeholder="What are you advertising?"
            className="rounded border border-line bg-paper-3 px-2 py-1 focus:border-ink focus:outline-none"
          />
          <Label>Market</Label>
          <select
            value={MARKETS[b.market ?? ''] ? b.market : market.name}
            onChange={(e) => update(c.id, { market: e.target.value, currency: MARKETS[e.target.value]?.currency, cities: b.cities.length ? b.cities : MARKETS[e.target.value]?.cities ?? [] })}
            className="rounded border border-line bg-paper-3 px-1.5 py-1"
            aria-label="Market"
          >
            {Object.keys(MARKETS).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <Label>Audience</Label>
          <select value={b.audience} onChange={(e) => update(c.id, { audience: e.target.value })} className="rounded border border-line bg-paper-3 px-1.5 py-1">
            <option value="">Not set</option>
            {['18–24', '22–35', '25–44', '35+'].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <Label>Cities</Label>
          <div className="flex flex-wrap gap-1">
            {options.map((city) => (
              <button
                key={city}
                onClick={() => toggleCity(city)}
                className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] transition ${b.cities.includes(city) ? 'bg-ink text-chalk' : 'border border-line text-ink-3 hover:border-ink'}`}
              >
                {city}
              </button>
            ))}
          </div>
          {new Set(b.cities.map(countryOfCity).filter(Boolean)).size > 1 && (
            <>
              <span />
              <p className="font-mono text-[10.5px] leading-snug text-ink-3">
                These cities span several countries, so scores use Qloo&apos;s world map: good for comparing countries, coarser between cities in one country.
              </p>
            </>
          )}
          <span />
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              void addPlace()
            }}
          >
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Add a town or state…"
              className="min-w-0 flex-1 rounded border border-line bg-paper-3 px-2 py-1 text-[12px] focus:border-ink focus:outline-none"
              aria-label="Add a region"
            />
            <button className="rounded border border-line p-1 hover:border-ink" aria-label="Add region">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
          {placeMsg && (
            <>
              <span />
              <span className="font-mono text-[10.5px] text-ink-3">{placeMsg}</span>
            </>
          )}
          <Label>Keep as is</Label>
          <div className="flex flex-wrap items-center gap-1">
            {(b.locked ?? []).map((l) => (
              <span key={l} className="inline-flex items-center gap-1 rounded bg-ink px-1.5 py-0.5 font-mono text-[10.5px] text-chalk">
                {l}
                <button onClick={() => update(c.id, { locked: (b.locked ?? []).filter((x) => x !== l) })} aria-label={`Unlock ${l}`} className="opacity-60 hover:opacity-100">
                  ×
                </button>
              </span>
            ))}
            <input
              placeholder={(b.locked ?? []).length ? 'Add…' : 'Sponsors, logos, mandatory lines'}
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim()
                if (e.key === 'Enter' && v) {
                  update(c.id, { locked: Array.from(new Set([...(b.locked ?? []), v])) })
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
              className="min-w-[120px] flex-1 rounded border border-line bg-paper-3 px-2 py-1 text-[12px] focus:border-ink focus:outline-none"
              aria-label="Add an element to keep unchanged"
            />
          </div>
          <Label>Works in</Label>
          <select value={b.sourceCity ?? ''} onChange={(e) => update(c.id, { sourceCity: (e.target.value || undefined) as City | undefined })} className="rounded border border-line bg-paper-3 px-1.5 py-1">
            <option value="">Detect from the ad</option>
            {options.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <Label>Budget</Label>
          <input
            type="number"
            min={0}
            step={10000}
            value={b.budget ?? ''}
            onChange={(e) => update(c.id, { budget: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={symbolOf(currencyOf(b))}
            className="rounded border border-line bg-paper-3 px-2 py-1 font-mono focus:border-ink focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}

const Label = ({ children }: { children: string }) => <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{children}</span>
