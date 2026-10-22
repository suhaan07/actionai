import { ArrowRight, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AGENTS, BRAND_AGENTS, CREATOR_COPY, metaOf } from '../lib/agents'
import type { AgentId } from '../lib/types'
import { SCENARIOS } from '../lib/demo'
import { useTour } from '../lib/tour'
import { useStore } from '../lib/store'
import { AgentCards } from '../components/home/AgentCards'
import { pinLine, Slate } from '../components/home/Slate'
import { Logo, StatusPill } from '../components/ui'
import { usePrompt } from '../components/usePrompt'

type Mode = 'brands' | 'creators'
const CREATOR_AGENTS: AgentId[] = ['grow', 'test', 'adapt', 'spend']
const CREATOR_EXAMPLES = [
  { glyph: '↗', t: AGENTS.grow.examples[0] },
  { glyph: '↗', t: AGENTS.grow.examples[1] },
  { glyph: '◎', t: 'Will my skincare Reel land in Bengaluru, Pune and Hyderabad?' },
  { glyph: '⇄', t: 'Rewrite my Delhi food vlog for Kolkata, keep my catchphrase' },
  { glyph: '?', t: 'Which creators does Chennai love right now?' },
]

const savedMode = (): Mode => {
  try {
    // Creators first, unless this visitor picked ad teams before.
    return localStorage.getItem('action-ai:mode') === 'brands' ? 'brands' : 'creators'
  } catch {
    return 'creators'
  }
}

export default function Home() {
  const nav = useNavigate()
  const [mode, setModeState] = useState<Mode>(savedMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem('action-ai:mode', m)
    } catch {
      /* private window */
    }
  }
  const creators = mode === 'creators'
  const prompt = usePrompt('slate')
  const { createCampaign, submit } = useStore()
  const startTour = useTour((s) => s.start)
  const { pinned, setPinned } = prompt

  const action = () => {
    // The tour's campaign starts with the EchoFest brief: five cities, 18–34s, sponsor locked.
    const t = useTour.getState()
    const sc = SCENARIOS[t.scenario]
    const id = t.active && !t.campaignId ? createCampaign({ name: sc.name, brief: sc.brief }) : createCampaign()
    submit(id, { text: prompt.text.trim(), attachments: prompt.attachments, pinned })
    nav(`/c/${id}`)
  }

  const examples = pinned
    ? AGENTS[pinned].examples.map((t) => ({ glyph: AGENTS[pinned].glyph, t }))
    : creators
      ? CREATOR_EXAMPLES
      : [...BRAND_AGENTS.map((a) => ({ glyph: AGENTS[a].glyph, t: AGENTS[a].examples[0] })), { glyph: '?', t: 'Who could be our cricket ambassador in London and Mumbai?' }]

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3">
          <StatusPill />
          <a href="#campaigns" className="text-[13px] font-medium text-ink-2 hover:text-ink">
            Campaigns
          </a>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-mono text-xs text-chalk">S</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="pb-10 pt-8 text-center sm:pt-14">
          <div className="mb-5 inline-flex rounded-full border border-line bg-paper-3 p-1" role="tablist" aria-label="Who is it for">
            {(['brands', 'creators'] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                data-tour={`mode-${m}`}
                onClick={() => {
                  setMode(m)
                  setPinned(undefined)
                }}
                className={`rounded-full px-3.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] transition ${mode === m ? 'bg-ink text-chalk' : 'text-ink-2 hover:text-ink'}`}
              >
                {m === 'brands' ? 'For ad teams' : 'For creators'}
              </button>
            ))}
          </div>
          <p className="label mb-5 flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-tally tally-blink" /> {creators ? 'No brand manager needed · one taste graph · every city' : 'Four agents · one taste graph · every city'}
          </p>
          <h1 className="font-display text-[56px] font-black uppercase leading-[0.86] tracking-[-0.01em] sm:text-[92px] lg:text-[112px]">
            Make it <span className="relative inline-block">land<span className="absolute -bottom-1 left-0 right-0 h-[0.09em] bg-tally" /></span>
            <br />
            in every city.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-ink-2">
            {creators ? (
              <>
                Find the cities your Reels and posts will land in next, and get a hook, caption, hashtags, audio and local creators to collab with for each. Built on Qloo&apos;s taste data, <em className="font-serif text-[18px] text-ink">not</em> guesswork.
              </>
            ) : (
              <>
                    Know which version of your ad fits which city, and where your budget will work hardest, <em className="font-serif text-[18px] text-ink">before</em> you spend on media. Any city, any market.
                  </>
                )}
              </p>
              <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-2">
                {creators ? (
                  <>
                    <button
                      onClick={() => startTour('creator-us')}
                      className="group inline-flex items-center gap-2.5 rounded-full border border-ink bg-paper-3 py-1.5 pl-1.5 pr-4 text-[13px] font-semibold shadow-card transition hover:-translate-y-0.5"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-chalk">
                        <Play className="h-3 w-3 fill-chalk" />
                      </span>
                      Take the tour
                      <span className="font-normal text-ink-3">· a TikToker in Atlanta grows into new cities · you click through · 3 min</span>
                    </button>
                    <button onClick={() => startTour('creator-india')} className="text-[12.5px] font-medium text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink">
                      or the India version
                    </button>
                  </>
                ) : (
                  <>
                <button
                  onClick={() => startTour('us')}
                  className="group inline-flex items-center gap-2.5 rounded-full border border-ink bg-paper-3 py-1.5 pl-1.5 pr-4 text-[13px] font-semibold shadow-card transition hover:-translate-y-0.5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-chalk">
                    <Play className="h-3 w-3 fill-chalk" />
                  </span>
                  Take the tour
                  <span className="font-normal text-ink-3">· a festival touring five US cities · you click through · 4 min</span>
                </button>
                <button onClick={() => startTour('india')} className="text-[12.5px] font-medium text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink">
                  or the India version
                </button>
              </>
            )}
          </div>
        </section>

        <Slate prompt={prompt} onAction={action} placeholder={creators ? 'Drop a Reel or post, or say what you make and where you’re based…' : undefined} />

        <div className="mx-auto mt-4 max-w-3xl">
          <p className="min-h-[20px] text-center text-[13px] text-ink-2">
            {pinned ? pinLine(pinned) : creators ? 'Attach a Reel or post, or just say what you make and where you’re based.' : 'Just type. The router reads what you need and sends it to the right agent, or several in a row.'}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {examples.map((ex) => (
              <button
                key={ex.t}
                onClick={() => prompt.setText(ex.t)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-3 px-3 py-1.5 text-[12.5px] text-ink-2 transition hover:border-ink hover:text-ink"
              >
                <span className="font-mono text-[11px] text-ink-3">{ex.glyph}</span>
                {ex.t}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-16">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">The crew</p>
              <h2 className="font-display text-4xl font-black uppercase leading-none">{creators ? 'What it does for creators' : 'What the agents do'}</h2>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
              {creators ? (
                <>
                  Grow → Test → Adapt → Boost <span className="text-ink-2">· Instagram, TikTok, Shorts</span>
                </>
              ) : (
                <>
                  Create → Test → Adapt → Spend <span className="text-ink-2">· or any one alone</span>
                </>
              )}
            </p>
          </div>
          <AgentCards ids={creators ? CREATOR_AGENTS : BRAND_AGENTS} copy={creators ? CREATOR_COPY : undefined} pinned={pinned} onPick={(a) => setPinned(pinned === a ? undefined : a)} />
          <p className="mt-4 text-[12.5px] text-ink-3">
            Every score, insight and swap links to the Qloo taste data behind it. Fit scores are pre-testing, not A/B tests; budget splits are a starting point, not a forecast.
          </p>
        </section>

        <Recent />
      </main>
    </div>
  )
}

function Recent() {
  const nav = useNavigate()
  const { campaigns, order, deleteCampaign } = useStore()
  const list = order.map((id) => campaigns[id]).filter(Boolean)

  return (
    <section id="campaigns" className="mt-16">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-display text-2xl font-black uppercase leading-none">Recent campaigns</h2>
        <span className="label">{list.length} total</span>
      </div>
      {!list.length ? (
        <div className="rounded-lg border border-dashed border-line-2 px-6 py-10 text-center">
          <p className="font-display text-xl font-extrabold uppercase">No campaigns yet</p>
          <p className="mt-1 text-sm text-ink-2">Pick an agent above, or just type on the slate.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper-3">
          {list.map((c) => {
            const last = c.takes.at(-1)
            return (
              <li key={c.id} className="group flex items-center gap-4 px-4 py-3 transition hover:bg-paper">
                <span className="clapper-stripes-sm h-8 w-1.5 shrink-0 rounded-full" />
                <button onClick={() => nav(`/c/${c.id}`)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14px] font-semibold">{c.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-3">
                    {c.takes.length} take{c.takes.length === 1 ? '' : 's'}
                    {last ? ` · last: ${metaOf(last.agent).name}` : ''} · {c.brief.cities.join(', ') || 'no cities yet'}
                  </p>
                </button>
                <span className="hidden font-mono text-[11px] text-ink-3 sm:block">{new Date(c.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <button onClick={() => deleteCampaign(c.id)} className="rounded p-1.5 text-ink-3 opacity-0 transition hover:text-fit-low group-hover:opacity-100" aria-label={`Delete ${c.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => nav(`/c/${c.id}`)} aria-label={`Open ${c.name}`}>
                  <ArrowRight className="h-4 w-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
