import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { firstOfScene, markAsked, useTour } from '../lib/tour'

type Rect = { top: number; left: number; width: number; height: number }

const find = (sel: string, pick: 'first' | 'last' = 'first'): HTMLElement | null => {
  if (!sel) return null
  const all = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => el.offsetParent !== null || el.getClientRects().length)
  return (pick === 'last' ? all.at(-1) : all[0]) ?? null
}

/** The interactive product tour: spotlight + anchored card; the judge does every click. */
export function TourLayer() {
  const { active, i, run, steps: TOUR, scenes: SCENES, campaignId, next, back, stop, go, setCampaign, setDraft } = useTour()
  const loc = useLocation()
  const nav = useNavigate()
  const campaign = useStore((s) => (campaignId ? s.campaigns[campaignId] : undefined))
  const [rect, setRect] = useState<Rect | null>(null)
  const [open, setOpen] = useState(false)
  const entered = useRef<string>('')
  const step = TOUR[i]

  // Follow the campaign the tour created.
  useEffect(() => {
    if (!active) return
    const m = loc.pathname.match(/^\/c\/(.+)$/)
    if (m && m[1] !== campaignId) setCampaign(m[1])
  }, [active, loc.pathname, campaignId, setCampaign])

  const waiting = !!(active && step?.ready && !step.ready(campaign))

  // Entering a step: fill the prompt, skip if not applicable, scroll the target into view.
  useEffect(() => {
    const key = `${run}:${i}`
    if (!active || !step || waiting || entered.current === key) return
    entered.current = key
    if (step.skipIf?.(campaign)) {
      // let the page render once before deciding
      const t = setTimeout(() => (step.skipIf?.(campaign) ? next() : (entered.current = '')), 900)
      return () => clearTimeout(t)
    }
    if (step.id === 'ask-send') markAsked(campaign)
    if (step.draft) setDraft(step.draft.surface, step.draft.text, step.draft.pinned)
    const t = setTimeout(() => find(step.target, step.pick)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
    return () => clearTimeout(t)
  }, [active, i, run, step, waiting, campaign, next, setDraft])

  // Safety net: if the prompt didn't fill in (so ACTION is disabled), fill it again.
  useEffect(() => {
    if (!active || !step?.draft || waiting) return
    const t = setInterval(() => {
      const el = find(step.target, step.pick) as HTMLButtonElement | null
      if (el?.disabled) setDraft(step.draft!.surface, step.draft!.text, step.draft!.pinned)
    }, 1200)
    return () => clearInterval(t)
  }, [active, step, waiting, setDraft])

  // Track the target's position.
  useLayoutEffect(() => {
    if (!active || !step) return
    const sel = waiting ? '[data-tour="shotlist"]' : step.target
    const pick = waiting ? 'last' : step.pick
    let scrolled = false
    const tick = () => {
      const el = find(sel, pick)
      if (!el) return setRect(null)
      let r = el.getBoundingClientRect()
      // Bring the target into view once it exists, if it is off-screen or clipped by its scroll container.
      if (!scrolled) {
        let clipped = r.top < 70 || r.bottom > window.innerHeight - 20
        for (let p = el.parentElement; p && !clipped; p = p.parentElement) {
          const o = getComputedStyle(p).overflowY
          if (o === 'auto' || o === 'scroll') {
            const pr = p.getBoundingClientRect()
            clipped = r.top < pr.top || r.bottom > pr.bottom
          }
        }
        if (clipped) {
          el.scrollIntoView({ block: 'center', behavior: 'auto' })
          r = el.getBoundingClientRect()
        }
        scrolled = true
      }
      setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : { top: r.top, left: r.left, width: r.width, height: r.height }))
    }
    tick()
    const id = setInterval(tick, 150)
    window.addEventListener('resize', tick)
    window.addEventListener('scroll', tick, true)
    return () => {
      clearInterval(id)
      window.removeEventListener('resize', tick)
      window.removeEventListener('scroll', tick, true)
    }
  }, [active, step, waiting])

  // Action steps: advance when the judge clicks the real element.
  useEffect(() => {
    if (!active || !step || step.mode !== 'click' || waiting) return
    const onClick = (e: MouseEvent) => {
      const el = find(step.target, step.pick)
      if (el && e.target instanceof Node && el.contains(e.target)) setTimeout(next, 350)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [active, step, waiting, next])

  // Expose the current step for automated checks.
  useEffect(() => {
    ;(window as unknown as { __tour?: unknown }).__tour = active ? { i, id: step?.id, mode: step?.mode, target: step?.target, pick: step?.pick, waiting } : null
  }, [active, i, step, waiting])

  if (!active || !step) return null

  const narrow = typeof window !== 'undefined' && window.innerWidth < 768
  const sceneDone = (s: number) => i > TOUR.map((t, k) => (t.scene === s ? k : -1)).reduce((a, b) => Math.max(a, b), -1)
  const finish = step.mode === 'finish'

  return (
    <>
      {/* spotlight */}
      {rect && !finish && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-[10px] transition-all duration-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(20,18,16,0.42)',
          }}
        >
          <span className="tour-ring absolute inset-0 rounded-[10px] border-2 border-tally" />
        </div>
      )}
      {finish && <div aria-hidden className="fixed inset-0 z-[60] bg-ink/45" />}

      <TourCard
        rect={finish ? null : rect}
        place={step.place}
        narrow={narrow}
        center={finish}
      >
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-chalk-3">
          <span>
            {SCENES[step.scene].glyph} Scene {step.scene + 1} · {SCENES[step.scene].name}
          </span>
          <span className="ml-auto">
            {i + 1} / {TOUR.length}
          </span>
        </div>
        {waiting ? (
          <>
            <h3 className="mt-1.5 flex items-center gap-2 font-display text-[22px] font-black uppercase leading-none">
              <span className="tally-blink h-2.5 w-2.5 rounded-full bg-tally" /> Rolling
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-chalk-2">The agents are calling Qloo live. Watch the shot list; the tour continues when they wrap.</p>
          </>
        ) : (
          <>
            <h3 className="mt-1.5 font-display text-[22px] font-black uppercase leading-[0.95]">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-chalk-2">{step.body}</p>
            {step.mode === 'click' && (
              <p className="mt-2.5 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider text-chalk">
                <span className="h-2 w-2 rounded-full bg-tally" /> Your turn: click the highlighted {step.target.includes('action') ? 'ACTION button' : 'spot'}
              </p>
            )}
            {!rect && !finish && step.mode !== 'finish' && <p className="mt-2 font-mono text-[10.5px] text-chalk-3">Scroll a little if you don’t see it.</p>}
          </>
        )}
        <div className="mt-3 flex items-center gap-2">
          {i > 0 && !finish && (
            <button onClick={back} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-chalk-3 hover:text-chalk">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          {!finish && (
            <button onClick={stop} className="rounded px-1.5 py-1 text-[12px] text-chalk-3 hover:text-chalk">
              Skip tour
            </button>
          )}
          <span className="ml-auto" />
          {step.mode === 'next' && !waiting && (
            <button onClick={next} className="inline-flex items-center gap-1.5 rounded-md bg-chalk px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-white">
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
          {finish && (
            <>
              <button onClick={stop} className="rounded-md border border-chalk/30 px-3 py-1.5 text-[13px] text-chalk hover:border-chalk">
                Keep exploring
              </button>
              <button
                onClick={() => {
                  stop()
                  nav('/')
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-chalk px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-white"
              >
                Start your own campaign <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </TourCard>

      {/* progress pill */}
      {!finish && (
        <div className="fixed bottom-4 right-14 z-[70] hidden md:block">
          {open && (
            <div className="rise mb-2 ml-auto w-60 overflow-hidden rounded-lg border border-ink bg-paper-3 shadow-slate">
              {SCENES.map((s, k) => {
                const done = sceneDone(k)
                const current = step.scene === k
                const reachable = done || current
                return (
                  <button
                    key={s.name}
                    disabled={!reachable}
                    onClick={() => go(firstOfScene(TOUR, k))}
                    className={`flex w-full items-center gap-2.5 border-b border-line px-3 py-2 text-left text-[13px] last:border-0 ${current ? 'bg-paper font-semibold' : ''} disabled:opacity-40`}
                  >
                    <span className={`grid h-5 w-5 place-items-center rounded-full font-mono text-[10px] ${done ? 'bg-fit-high text-white' : current ? 'bg-ink text-chalk' : 'bg-paper-2'}`}>
                      {done ? <Check className="h-3 w-3" /> : k + 1}
                    </span>
                    <span className="font-mono text-[11px]">{s.glyph}</span> {s.name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-full border border-ink bg-ink py-1 pl-3 pr-1 text-chalk shadow-slate">
            <button onClick={() => setOpen(!open)} className="flex items-center gap-2 py-0.5 text-[12px]">
              <span className="clapper-stripes-sm h-2.5 w-6 rounded-[2px]" />
              <span className="font-semibold">Tour</span>
              <span className="font-mono text-[10.5px] text-chalk-2">
                Scene {step.scene + 1}/{SCENES.length}
              </span>
              <span className="flex gap-0.5">
                {SCENES.map((_, k) => (
                  <span key={k} className={`h-1.5 w-1.5 rounded-full ${sceneDone(k) ? 'bg-fit-high' : step.scene === k ? 'bg-chalk' : 'bg-chalk/25'}`} />
                ))}
              </span>
            </button>
            <button onClick={stop} className="ml-1 rounded-full p-1 text-chalk-3 hover:bg-chalk/10 hover:text-chalk" aria-label="Exit the tour">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const CARD_W = 330

function TourCard({ rect, place = 'bottom', narrow, center, children }: { rect: Rect | null; place?: string; narrow: boolean; center?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(170)
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight)
  })

  let style: React.CSSProperties
  if (narrow) style = { left: 12, right: 12, bottom: 12 }
  else if (center || !rect) style = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: center ? 420 : CARD_W }
  else {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 14
    const space = { bottom: vh - (rect.top + rect.height), top: rect.top, right: vw - (rect.left + rect.width), left: rect.left }
    let p = place
    if (p === 'bottom' && space.bottom < h + gap + 10) p = space.top > h + gap ? 'top' : 'right'
    if (p === 'top' && space.top < h + gap + 10) p = space.bottom > h + gap ? 'bottom' : 'left'
    if (p === 'right' && space.right < CARD_W + gap + 10) p = space.left > CARD_W + gap ? 'left' : 'bottom'
    if (p === 'left' && space.left < CARD_W + gap + 10) p = space.right > CARD_W + gap ? 'right' : 'bottom'
    let top = 0
    let left = 0
    if (p === 'bottom') {
      top = rect.top + rect.height + gap
      left = rect.left + rect.width / 2 - CARD_W / 2
    } else if (p === 'top') {
      top = rect.top - h - gap
      left = rect.left + rect.width / 2 - CARD_W / 2
    } else if (p === 'right') {
      top = rect.top + rect.height / 2 - h / 2
      left = rect.left + rect.width + gap
    } else {
      top = rect.top + rect.height / 2 - h / 2
      left = rect.left - CARD_W - gap
    }
    style = { top: Math.max(10, Math.min(top, vh - h - 10)), left: Math.max(10, Math.min(left, vw - CARD_W - 10)), width: CARD_W }
  }

  return (
    <div ref={ref} role="dialog" aria-label="Product tour" className="fixed z-[80] rounded-xl border border-ink bg-ink p-4 text-chalk shadow-slate transition-[top,left] duration-300" style={style}>
      {children}
    </div>
  )
}
