import type { AgentId, StepAgent } from './types'

export interface AgentMeta {
  id: StepAgent
  scene: string
  name: string
  glyph: string
  bring: string
  get: string
  line: string
  placeholder: string
  examples: string[]
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  create: {
    id: 'create',
    scene: '01',
    name: 'Create',
    glyph: '✦',
    bring: 'A brief',
    get: 'What each city loves, ad ideas built on it, and a shoot brief',
    line: 'From a brief to ideas each city will love',
    placeholder: 'Describe the brief: product, audience, cities…',
    examples: ['Launching a canned cold coffee for college students in Mumbai, Bengaluru and Kolkata: insights, a script and 3 Reel ideas', 'A sneaker drop for 18–24s in New York, Atlanta and LA: what does each city love?'],
  },
  test: {
    id: 'test',
    scene: '02',
    name: 'Test',
    glyph: '◎',
    bring: 'Ads you already have: script, video, image, Reel',
    get: 'A fit score per city, what helps, what hurts, how to fix it',
    line: 'From your ads to a score per city',
    placeholder: 'Attach up to 3 ads, or paste a script, and name the cities…',
    examples: ['Will a Punjabi-wedding Diwali ad work in Chennai, Kolkata and Mumbai?', 'Pre-test my Reel across London, Manchester and Glasgow'],
  },
  adapt: {
    id: 'adapt',
    scene: '03',
    name: 'Adapt',
    glyph: '⇄',
    bring: 'An ad that works in one city',
    get: 'A version for another city, every change explained',
    line: 'From an ad that works in one city to others',
    placeholder: 'Attach the ad that already works, and say where it needs to land…',
    examples: ['Our Nashville country promo needs a Miami version. Keep the sponsor logo', 'Make this Delhi ad work in Chennai, only change the music'],
  },
  spend: {
    id: 'spend',
    scene: '04',
    name: 'Spend',
    glyph: '▤',
    bring: 'A budget and your ads',
    get: 'How to split it across cities, and where to fix the ad first',
    line: 'From a budget to a split per city',
    placeholder: 'Your budget, your ads and the cities you want to run in…',
    examples: ['Split $50K across New York, Atlanta and Miami, fit first', 'We have ₹5L for six Indian cities. Where does it work hardest?'],
  },
}

export const AGENT_ORDER: AgentId[] = ['create', 'test', 'adapt', 'spend']

export const READ_META: AgentMeta = {
  id: 'read',
  scene: '00',
  name: 'Read',
  glyph: '▣',
  bring: 'Any creative',
  get: 'Its cultural references, resolved to Qloo',
  line: 'Reads the ad once, for every agent',
  placeholder: '',
  examples: [],
}

export const metaOf = (a: StepAgent): AgentMeta => (a === 'read' ? READ_META : AGENTS[a])
