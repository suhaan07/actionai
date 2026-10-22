import { create } from 'zustand'
import { SCENARIOS, SPONSOR_NAME, type Scenario } from './demo'
import type { AgentId, Campaign } from './types'

// A product tour in the style of interactive SaaS demos: a tooltip anchored to the real element,
// a spotlight, and the judge does every click. Action steps advance only when the target is clicked;
// steps with `ready` wait (pointing at the shot list) until the agents have finished.

export type Surface = 'slate' | 'composer'

export interface TourStep {
  id: string
  scene: number
  target: string
  pick?: 'first' | 'last'
  title: string
  body: string
  mode: 'click' | 'next' | 'finish'
  ready?: (c?: Campaign) => boolean
  skipIf?: (c?: Campaign) => boolean
  draft?: { surface: Surface; text: string; pinned?: AgentId }
  place?: 'top' | 'bottom' | 'left' | 'right'
}

export type Scene = { glyph: string; name: string }

export const SCENES: Scene[] = [
  { glyph: '✦', name: 'Create' },
  { glyph: '◎', name: 'Test' },
  { glyph: '⇄', name: 'Adapt' },
  { glyph: '?', name: 'Ask' },
  { glyph: '▤', name: 'Spend' },
]

export const CREATOR_SCENES: Scene[] = [
  { glyph: '↗', name: 'Grow' },
  { glyph: '◎', name: 'Pre-test' },
  { glyph: '⇄', name: 'Rewrite' },
  { glyph: '▤', name: 'Boost' },
]

const has = (c: Campaign | undefined, kind: string) => !!c && !c.busy && c.takes.some((t) => t.data.kind === kind)
const agentReplies = (c?: Campaign) => c?.messages.filter((m) => m.role === 'agent' && !m.planId && !m.questions).length ?? 0
let asked = 0

export const promptsFor = (sc: Scenario) => ({
  create: 'Show me what 18–34s in each EchoFest city are into, and give me three campaign routes per city.',
  test: `Test our hero film script across our five cities: ${sc.script}`,
  ask: 'Who should headline EchoFest in each city?',
  spend: `Split ${sc.budgetText} across our five cities.`,
})

/** The creator tour: one solo creator, no ad team. Grow → pre-test → rewrite for a weak city → a small boost. */
export function buildCreatorTour(sc: Scenario): TourStep[] {
  const india = sc.id === 'creator-india'
  const what = india ? 'street food Reels' : 'thrift-fit TikToks'
  return [
    {
      id: 'start',
      scene: 0,
      target: '[data-tour="slate-action"]',
      title: 'Meet a creator with no ad team',
      body: `${india ? 'A Delhi creator who makes street food Reels' : 'An Atlanta creator who posts thrift-fit TikToks'} (fictional) wants to reach the next city. No brand manager, no research budget: just one line. Press ACTION.`,
      mode: 'click',
      draft: { surface: 'slate', text: sc.script, pinned: 'grow' },
      place: 'bottom',
    },
    {
      id: 'grow-map',
      scene: 0,
      target: '[data-tour="grow-map"]',
      title: 'Where the content lands',
      body: `Grow read what they make and scored it in every big city with Qloo. ${sc.home} is home; the cities marked Grow next are where the same ${what} already fit, weighted by how many people live there.`,
      mode: 'next',
      ready: (c) => has(c, 'grow'),
      place: 'bottom',
    },
    {
      id: 'grow-who',
      scene: 0,
      target: '[data-tour="grow-who"]',
      title: 'Who the fans really are',
      body: 'Qloo’s age and gender skew of the people who love these references. If it pulls older than the creator’s Gen Z audience, the hooks below lean younger.',
      mode: 'next',
      skipIf: () => !document.querySelector('[data-tour="grow-who"]'),
      place: 'bottom',
    },
    {
      id: 'copy',
      scene: 0,
      target: '[data-tour="copy-caption"]',
      title: 'A post plan per city',
      body: 'A hook aimed at that city, a caption, hashtags people there search and a sound from its music list. Copy the caption and tags.',
      mode: 'click',
      place: 'left',
    },
    {
      id: 'collabs',
      scene: 0,
      target: '[data-tour="grow-collabs"]',
      title: 'Who to collab with',
      body: 'Creators this city’s audience loves. Big names: duet or stitch them. Less famous ones, found with Qloo’s popularity filter: pitch a real collab. Each has its score behind it.',
      mode: 'next',
      place: 'left',
    },
    {
      id: 'deals',
      scene: 0,
      target: '[data-tour="grow-deals"]',
      title: 'Brand deals and podcasts',
      body: 'What this creator’s fans also love in that city, from Qloo’s cross-category data: brands to pitch for a deal, podcasts to guest on.',
      mode: 'next',
      skipIf: () => !document.querySelector('[data-tour="grow-deals"]'),
      place: 'left',
    },
    {
      id: 'test-send',
      scene: 1,
      target: '[data-tour="composer-action"]',
      title: 'Pre-test before posting',
      body: `Will it land in ${sc.away} too? We’ve typed the question. Press ACTION.`,
      mode: 'click',
      draft: { surface: 'composer', text: `Will my content land in ${sc.away} and ${sc.home}?`, pinned: 'test' },
      place: 'top',
    },
    {
      id: 'away',
      scene: 1,
      target: `[data-tour="city-${sc.away}"]`,
      title: `Now ${sc.away}`,
      body: `Click ${sc.away}. Every reference is re-scored for that city and the text recolours: red is what won’t land there.`,
      mode: 'click',
      ready: (c) => has(c, 'test'),
      place: 'bottom',
    },
    {
      id: 'who',
      scene: 1,
      target: '[data-tour="who"]',
      title: 'Who it speaks to',
      body: 'The same fan skew, against the creator’s 18–24 audience. A post can fit a city and still reach the wrong people.',
      mode: 'next',
      place: 'left',
    },
    {
      id: 'adapt',
      scene: 2,
      target: '[data-tour="composer-action"]',
      title: `Rewrite it for ${sc.away}`,
      body: `Adapt swaps only what won’t land in ${sc.away} for what holds the same spot there, and keeps the creator’s voice. Press ACTION.`,
      mode: 'click',
      draft: { surface: 'composer', text: `Rewrite it for ${sc.away}, keep my voice`, pinned: 'adapt' },
      place: 'top',
    },
    {
      id: 'accept',
      scene: 2,
      target: '[data-tour="accept-clear"]',
      title: 'Local equivalents, scored',
      body: `Each swap must score higher in ${sc.away} than what it replaces, and passes a sensitivity check. Accept the clear ones and watch the fit climb.`,
      mode: 'click',
      ready: (c) => has(c, 'adapt'),
      skipIf: () => !document.querySelector('[data-tour="accept-clear"]:not([disabled])'),
      place: 'bottom',
    },
    {
      id: 'boost-send',
      scene: 3,
      target: '[data-tour="composer-action"]',
      title: `${sc.budgetText} to boost`,
      body: 'Last scene. Where should a small boost go? Press ACTION.',
      mode: 'click',
      draft: { surface: 'composer', text: `Split ${sc.budgetText} to boost my posts`, pinned: 'spend' },
      place: 'top',
    },
    {
      id: 'matrix',
      scene: 3,
      target: '[data-tour="matrix"]',
      title: 'Each city gets the right version',
      body: `The ${sc.away} rewrite runs in ${sc.away}, the original everywhere it already lands. A starting split, not a forecast: shift it after a few days of real results.`,
      mode: 'next',
      ready: (c) => has(c, 'spend'),
      place: 'bottom',
    },
    {
      id: 'wrap',
      scene: 3,
      target: '',
      title: 'That’s a wrap',
      body: `One line in, and a creator gets the cities to grow into, a post plan for each, collabs, brand deals, a rewrite and a boost plan, all from Qloo’s taste data. ${india ? 'There’s a US version too.' : 'There’s an India version too.'} Switch to For ad teams for the brand side.`,
      mode: 'finish',
    },
  ]
}

export function buildTour(sc: Scenario): TourStep[] {
  if (sc.kind === 'creator') return buildCreatorTour(sc)
  const p = promptsFor(sc)
  const where = sc.brief.cities.slice(0, -1).join(', ') + ' and ' + sc.brief.cities.at(-1)
  return [
    {
      id: 'start',
      scene: 0,
      target: '[data-tour="slate-action"]',
      title: 'Meet EchoFest',
      body: `A fictional music festival touring ${where}, for 18–34s, presented by ${SPONSOR_NAME}. We’ve written the brief on the slate. Press ACTION to roll.`,
      mode: 'click',
      draft: { surface: 'slate', text: p.create, pinned: 'create' },
      place: 'bottom',
    },
    {
      id: 'contrast',
      scene: 0,
      target: '[data-tour="contrast"]',
      title: 'Five cities, five crowds',
      body: 'Qloo’s taste profile for each city, side by side. Turn Contrast off and on: what every city shares fades out, what’s local stays.',
      mode: 'click',
      ready: (c) => has(c, 'create'),
      place: 'bottom',
    },
    {
      id: 'insight',
      scene: 0,
      target: '[data-tour="insights"] button[title="See the Qloo data behind this"]',
      title: 'Every insight has receipts',
      body: 'Click the little number after an insight.',
      mode: 'click',
      place: 'right',
    },
    {
      id: 'evidence',
      scene: 0,
      target: '[data-tour="evidence"]',
      title: 'The Qloo data behind it',
      body: 'The entities, heatmap affinity per city and the exact Qloo calls. Nothing is claimed without this.',
      mode: 'next',
      place: 'left',
    },
    {
      id: 'test-send',
      scene: 1,
      target: '[data-tour="composer-action"]',
      title: 'Pre-test the promo',
      body: `Our hero film was written with ${sc.homeFlavour} in mind. We’ve pasted the script into the chat. Press ACTION and the agents score it in every city.`,
      mode: 'click',
      draft: { surface: 'composer', text: p.test, pinned: 'test' },
      place: 'top',
    },
    {
      id: 'home',
      scene: 1,
      target: `[data-tour="city-${sc.home}"]`,
      title: 'Home turf',
      body: `Click ${sc.home}. Every cultural reference in the script is scored by Qloo for that city.`,
      mode: 'click',
      ready: (c) => has(c, 'test'),
      place: 'bottom',
    },
    {
      id: 'away',
      scene: 1,
      target: `[data-tour="city-${sc.away}"]`,
      title: `Now ${sc.away}`,
      body: 'Same script, different city. Watch it recolour.',
      mode: 'click',
      place: 'bottom',
    },
    {
      id: 'highlight',
      scene: 1,
      target: '[data-tour="script"] [data-lowest="1"]',
      title: 'What’s dragging it down?',
      body: 'This is the weakest reference here. Click it to see its Qloo heatmap across the five cities.',
      mode: 'click',
      skipIf: () => !document.querySelector('[data-tour="script"] [data-lowest="1"]'),
      place: 'bottom',
    },
    {
      id: 'personas',
      scene: 1,
      target: '[data-tour="personas"]',
      title: 'Simulated fans',
      body: `Each persona is a Qloo taste cluster for an age and gender band in ${sc.away}, reacting to the ad. Simulated, never real people.`,
      mode: 'next',
      place: 'left',
    },
    {
      id: 'adapt',
      scene: 2,
      target: '[data-tour="composer-action"]',
      title: `Fix it for ${sc.away}`,
      body: `We’ve asked the Adapt agent to make it work in ${sc.away}. The sponsor, ${SPONSOR_NAME}, is locked on the call sheet, so it never changes. Press ACTION.`,
      mode: 'click',
      draft: { surface: 'composer', text: `Make it work in ${sc.away}`, pinned: 'adapt' },
      place: 'top',
    },
    {
      id: 'accept',
      scene: 2,
      target: '[data-tour="accept-clear"]',
      title: 'Local equivalents, scored',
      body: `Each weak reference swapped for what holds the same cultural slot in ${sc.away}. Accept the clear swaps and watch the fit climb.`,
      mode: 'click',
      ready: (c) => has(c, 'adapt'),
      skipIf: () => !document.querySelector('[data-tour="accept-clear"]:not([disabled])'),
      place: 'bottom',
    },
    {
      id: 'safer',
      scene: 2,
      target: '[data-tour="safer"]',
      title: 'A human makes the call',
      body: 'The sensitivity check flagged this swap. It can’t be accepted until someone decides. Take the safer option.',
      mode: 'click',
      skipIf: () => !document.querySelector('[data-tour="safer"]'),
      place: 'top',
    },
    {
      id: 'see-after',
      scene: 2,
      target: '[data-tour="mock-after"]',
      title: `See the ${sc.away} cut`,
      body: `An AI mock-up of the adapted version, rendered from its script. Click to render the ${sc.away} frame.`,
      mode: 'click',
      skipIf: () => !document.querySelector('[data-tour="mock-after"]'),
      place: 'bottom',
    },
    {
      id: 'see-before',
      scene: 2,
      target: '[data-tour="mock-before"]',
      title: 'Now the original',
      body: `Render the ${sc.home} original next to it: same ad, two cities, side by side. Text is added by Action AI, never drawn by the AI.`,
      mode: 'click',
      skipIf: () => !document.querySelector('[data-tour="mock-before"]'),
      place: 'bottom',
    },
    {
      id: 'ask-send',
      scene: 3,
      target: '[data-tour="composer-action"]',
      title: 'Book the line-up',
      body: 'Not every question needs an agent run. Ask anything the taste graph can answer: we’ve typed one in. Press ACTION.',
      mode: 'click',
      draft: { surface: 'composer', text: p.ask },
      place: 'top',
    },
    {
      id: 'ask-footnote',
      scene: 3,
      target: '[data-tour="chat-answer"] button[title="See the Qloo data behind this"]',
      pick: 'last',
      title: 'A headliner per city',
      body: 'Each pick is what that city’s crowd over-indexes on. Click a number to see the artist’s affinity across all five cities.',
      mode: 'click',
      ready: (c) => !!c && !c.busy && agentReplies(c) > asked,
      place: 'right',
    },
    {
      id: 'spend-send',
      scene: 4,
      target: '[data-tour="composer-action"]',
      title: `Where does ${sc.budgetText} work hardest?`,
      body: 'Last scene. Press ACTION to split the budget across the five cities.',
      mode: 'click',
      draft: { surface: 'composer', text: p.spend, pinned: 'spend' },
      place: 'top',
    },
    {
      id: 'matrix',
      scene: 4,
      target: '[data-tour="matrix"]',
      title: 'Each city gets its best version',
      body: `Outlined cells show which version runs where: the ${sc.away} cut in ${sc.away}. Weak-fit cities with big audiences get flagged before you spend.`,
      mode: 'next',
      ready: (c) => has(c, 'spend'),
      place: 'bottom',
    },
    {
      id: 'wrap',
      scene: 4,
      target: '',
      title: 'That’s a wrap',
      body: `Brief to insight, pre-test, local version, line-up and budget, every step backed by Qloo’s taste data. ${sc.id === 'us' ? 'There’s an India version of this tour too, and' : 'It works in any market, and'} you can try your own campaign now.`,
      mode: 'finish',
    },
  ]
}

export const firstOfScene = (steps: TourStep[], scene: number) => steps.findIndex((s) => s.scene === scene)

interface TourState {
  active: boolean
  i: number
  /** increments on every start, so a restarted tour re-runs each step's setup */
  run: number
  scenario: Scenario['id']
  steps: TourStep[]
  scenes: Scene[]
  campaignId: string | null
  draft: { surface: Surface; text: string; pinned?: AgentId; n: number } | null
  start: (scenario?: Scenario['id']) => void
  stop: () => void
  next: () => void
  back: () => void
  go: (i: number) => void
  setCampaign: (id: string) => void
  setDraft: (surface: Surface, text: string, pinned?: AgentId) => void
}

export const useTour = create<TourState>()((set, get) => ({
  active: false,
  i: 0,
  run: 0,
  scenario: 'us',
  steps: buildTour(SCENARIOS.us),
  scenes: SCENES,
  campaignId: null,
  draft: null,
  start: (scenario = 'us') =>
    set((s) => ({
      active: true,
      i: 0,
      campaignId: null,
      run: s.run + 1,
      scenario,
      steps: buildTour(SCENARIOS[scenario]),
      scenes: SCENARIOS[scenario].kind === 'creator' ? CREATOR_SCENES : SCENES,
    })),
  stop: () => set({ active: false, draft: null }),
  next: () => set({ i: Math.min(get().i + 1, get().steps.length - 1) }),
  back: () => set({ i: Math.max(0, get().i - 1) }),
  go: (i) => set({ i }),
  setCampaign: (id) => set({ campaignId: id }),
  setDraft: (surface, text, pinned) => set((s) => ({ draft: { surface, text, pinned, n: (s.draft?.n ?? 0) + 1 } })),
}))

/** Remember how many plain agent replies existed before the Ask step, so we know when the answer arrives. */
export const markAsked = (c?: Campaign) => {
  asked = agentReplies(c)
}
