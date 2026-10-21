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

export const SCENES = [
  { glyph: '✦', name: 'Create' },
  { glyph: '◎', name: 'Test' },
  { glyph: '⇄', name: 'Adapt' },
  { glyph: '?', name: 'Ask' },
  { glyph: '▤', name: 'Spend' },
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

export function buildTour(sc: Scenario): TourStep[] {
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
      target: '[data-tour="script"] [data-band="low"]',
      title: 'What’s dragging it down?',
      body: 'Click a red phrase to see its Qloo heatmap across the five cities.',
      mode: 'click',
      skipIf: () => !document.querySelector('[data-tour="script"] [data-band="low"]'),
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
  campaignId: null,
  draft: null,
  start: (scenario = 'us') => set((s) => ({ active: true, i: 0, campaignId: null, run: s.run + 1, scenario, steps: buildTour(SCENARIOS[scenario]) })),
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
