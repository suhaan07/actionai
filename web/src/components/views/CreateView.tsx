import { ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Campaign, City, Master } from '../../lib/types'
import { Chip, Footnote, SectionLabel } from '../ui'
import { PopBadge } from './intel'
import { Mockup } from './Mockup'

export function CreateView({ c, cities, master }: { c: Campaign; cities: City[]; master?: Master }) {
  const [contrast, setContrast] = useState(true)
  const shown = cities.filter((x) => c.profiles[x])
  const shared = useMemo(() => {
    const count = new Map<string, number>()
    for (const city of shown) for (const d of c.profiles[city].domains) for (const it of d.items) count.set(it.name, (count.get(it.name) ?? 0) + 1)
    return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k))
  }, [c.profiles, shown])

  if (!shown.length) return <p className="text-[14px] text-ink-3">No Qloo profiles came back for these regions.</p>

  return (
    <div className="space-y-8">
      {master && <MasterCard master={master} brand={c.brief.brand} />}
      <div>
        <SectionLabel
          right={
            <label data-tour="contrast" className="inline-flex cursor-pointer items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-ink-2">
              <input type="checkbox" checked={contrast} onChange={(e) => setContrast(e.target.checked)} className="accent-ink" />
              Contrast: dim what regions share
            </label>
          }
        >
          Qloo taste profiles · {c.brief.audience || 'all ages'}
        </SectionLabel>
        <div className="scroll-thin -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {shown.map((city) => {
            const p = c.profiles[city]
            const w = c.writes[city]
            return (
              <article key={city} className="card w-[290px] shrink-0 snap-start overflow-hidden">
                <header className="border-b border-line bg-ink px-4 py-3 text-chalk">
                  <h3 className="font-display text-[30px] font-black uppercase leading-none">{city}</h3>
                  {p.audience && <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-chalk-3">{p.audience} fans only</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.tags.slice(0, 8).map((t) => (
                      <span key={t.id} className="rounded bg-chalk/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-chalk-2">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </header>
                <div className="space-y-3 px-4 py-3">
                  {p.domains.map((d) => (
                    <div key={d.key}>
                      <p className="label mb-1">{d.label}</p>
                      <p className="text-[13px] leading-relaxed">
                        {d.items.slice(0, 5).map((it, i, arr) => (
                          <span key={it.id} title={[it.description, it.affinity != null ? `Qloo affinity ${Math.round(it.affinity * 100)}` : ''].filter(Boolean).join(' · ') || undefined} className={`transition-opacity ${contrast && shared.has(it.name) ? 'opacity-30' : ''}`}>
                            {it.name}
                            {it.popularity != null && it.popularity < 0.4 && (
                              <span className="ml-1 align-middle">
                                <PopBadge value={it.popularity} />
                              </span>
                            )}
                            {i < arr.length - 1 && <span className="text-ink-3"> · </span>}
                          </span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
                {w && (
                  <div data-tour="insights" className="border-t border-line bg-paper px-4 py-3">
                    <p className="label mb-2">Insights</p>
                    <ol className="space-y-2.5">
                      {w.insights.map((ins, i) => (
                        <li key={i} className="font-serif text-[15.5px] leading-snug">
                          {ins.text}
                          {ins.evidenceId && <Footnote n={i + 1} evidenceId={ins.evidenceId} />}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>

      {shown.some((x) => c.writes[x]) && (
        <>
          <div data-tour="routes">
            <SectionLabel>Creative routes</SectionLabel>
            <div className="space-y-5">
              {shown
                .filter((x) => c.writes[x])
                .map((city) => (
                  <div key={city}>
                    <p className="mb-2 font-display text-lg font-extrabold uppercase">{city}</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {c.writes[city].routes.map((r, i) => {
                        const ins = c.writes[city].insights[r.insight]
                        return (
                          <article key={i} className={`card flex flex-col p-4 ${r.flag ? 'border-fit-low/50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] text-ink-3">ROUTE {String.fromCharCode(65 + i)}</span>
                              <span className="clapper-stripes-sm h-2 w-8 rounded-[2px] opacity-70" />
                            </div>
                            <h4 className="mt-2 font-display text-2xl font-black uppercase leading-none">{r.title}</h4>
                            <p className="mt-2 font-serif text-[17px] italic leading-snug">“{r.hook}”</p>
                            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-2">{r.script}</p>
                            {r.flag && (
                              <div className="mt-3 rounded-md border border-fit-low/50 bg-fit-low/[0.06] px-2.5 py-2 text-[12px]">
                                <p className="flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-fit-low">
                                  <ShieldAlert className="h-3 w-3" /> Sensitivity check
                                </p>
                                <p className="mt-1">{r.flag.reason}</p>
                                {r.flag.safer && <p className="mt-1 text-ink-3">Safer: {r.flag.safer}</p>}
                              </div>
                            )}
                            {ins && (
                              <div className="mt-3 border-t border-line pt-2.5">
                                <span className="label">Stands on</span>
                                <p className="mt-0.5 text-[12px] text-ink-2">
                                  Insight {r.insight + 1}: {ins.text.length > 90 ? ins.text.slice(0, 88) + '…' : ins.text}
                                  {ins.evidenceId && <Footnote n={r.insight + 1} evidenceId={ins.evidenceId} />}
                                </p>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <SectionLabel>Collab ideas</SectionLabel>
              <ul className="card divide-y divide-line">
                {shown
                  .filter((x) => c.writes[x])
                  .map((city) => (
                    <li key={city} className="flex items-baseline gap-3 px-4 py-2.5">
                      <span className="label w-24 shrink-0 text-ink">{city}</span>
                      <span className="text-[13px]">{c.writes[city].collab}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <SectionLabel>Production brief</SectionLabel>
              <ul className="card divide-y divide-line">
                {shown
                  .filter((x) => c.writes[x])
                  .map((city) => {
                    const pr = c.writes[city].production
                    return (
                      <li key={city} className="px-4 py-2.5">
                        <span className="label text-ink">{city}</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Chip>♪ {pr.music}</Chip>
                          <Chip>⌖ {pr.locations}</Chip>
                          <Chip>◇ {pr.wardrobe}</Chip>
                        </div>
                      </li>
                    )
                  })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Flag({ flag }: { flag?: { reason: string; safer: string } | null }) {
  if (!flag) return null
  return (
    <div className="mt-3 rounded-md border border-fit-low/50 bg-fit-low/[0.06] px-3 py-2 text-[12.5px]">
      <p className="flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-fit-low">
        <ShieldAlert className="h-3 w-3" /> Sensitivity check
      </p>
      <p className="mt-1">{flag.reason}</p>
      {flag.safer && <p className="mt-1 text-ink-3">Safer: {flag.safer}</p>}
    </div>
  )
}

function MasterCard({ master, brand }: { master: Master; brand?: string }) {
  const post = master.post
  return (
    <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="label text-ink-2">Master script</span>
          <span className="clapper-stripes-sm ml-auto h-2.5 w-10 rounded-[2px]" />
        </div>
        <div className="p-5">
          <h3 className="font-display text-[32px] font-black uppercase leading-none">{master.title}</h3>
          <p className="mt-4 whitespace-pre-line font-serif text-[19px] leading-[1.6]">{master.script}</p>
          <Flag flag={master.flag} />
          <p className="mt-4 font-mono text-[10.5px] text-ink-3">Next in the shot list: read and scored in every region, then adapted where it fits weakly.</p>
        </div>
      </section>

      {post && (
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="label text-ink-2">Instagram post</span>
            <span className="ml-auto font-mono text-[10px] text-ink-3">design brief</span>
          </div>
          <div className="p-4">
            {/* a 4:5 feed-post frame with the on-image text, as a layout sketch */}
            <Mockup className="mx-auto w-full max-w-[300px]" text={`${post.visual}\n${master.script}`} kind="instagram post" aspect="4:5" headline={post.on_image_text} />
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              <span className="label mr-1">Visual brief</span>
              {post.visual}
            </p>
            <div className="mt-4">
              <p className="text-[12.5px] font-semibold">{brand || 'yourbrand'}</p>
              <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed">{post.caption}</p>
              <p className="mt-1.5 text-[12.5px] text-ink-2">{post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>
            </div>
            <Flag flag={post.flag} />
          </div>
        </section>
      )}
    </div>
    {!!master.reels?.length && (
      <div>
        <SectionLabel>Reel ideas · vertical, 15–30s</SectionLabel>
        <div className="grid gap-3 md:grid-cols-3">
          {master.reels.map((r, i) => (
            <article key={i} className="card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <span className="font-mono text-[10px] text-ink-3">REEL {String.fromCharCode(65 + i)} · {r.length_seconds}s</span>
                <span className="clapper-stripes-sm h-2 w-8 rounded-[2px] opacity-70" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h4 className="font-display text-2xl font-black uppercase leading-none">{r.title}</h4>
                <p className="mt-2 text-[12.5px]">
                  <span className="label mr-1">Hook</span>
                  {r.hook}
                </p>
                <ol className="mt-2 flex-1 list-decimal space-y-1 pl-4 text-[13px] leading-snug text-ink-2">
                  {r.shots.map((sh, k) => (
                    <li key={k}>{sh}</li>
                  ))}
                </ol>
                <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-[12px] text-ink-2">
                  <p>♪ {r.audio}</p>
                  <p>“{r.on_screen_text}”</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    )}
    </div>
  )
}
