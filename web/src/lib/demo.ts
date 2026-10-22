import type { Brief } from './types'

// Tour scenarios: the same fictional touring music festival, in two markets, with a fictional presenting sponsor.
// Every step runs the real agents; responses are cached server-side, so replays are instant and cost no quota.

export interface Scenario {
  id: 'us' | 'india' | 'creator-us' | 'creator-india'
  /** brand: the EchoFest ad-team tour; creator: a solo creator growing into new cities */
  kind?: 'brand' | 'creator'
  label: string
  name: string
  brief: Brief
  /** where the hero promo was written for, and the city we adapt it to */
  home: string
  away: string
  script: string
  budgetText: string
  homeFlavour: string
}

const SPONSOR = 'Sitara Pay'

export const SCENARIOS: Record<Scenario['id'], Scenario> = {
  us: {
    id: 'us',
    label: 'US tour',
    name: 'EchoFest US · tour',
    home: 'Nashville',
    away: 'Miami',
    homeFlavour: 'Nashville',
    budgetText: '$250K',
    brief: {
      product: 'EchoFest, a touring live-music festival (fictional)',
      brand: 'EchoFest',
      audience: '18–34',
      market: 'United States',
      currency: 'USD',
      cities: ['Nashville', 'Austin', 'New York', 'Atlanta', 'Miami'],
      locked: [SPONSOR],
      sourceCity: 'Nashville',
      campaignType: 'product',
      goal: 'Sell tickets for a five-city US music festival tour with one hero film, versioned per city.',
    },
    script:
      'EchoFest is coming. Open on a packed Nashville honky-tonk at dusk as a country music headliner takes the stage in boots and a cowboy hat. ' +
      'The crowd line-dances to a fiddle-and-steel-guitar country anthem. Between sets, friends queue for Nashville hot chicken. ' +
      'Late at night, a bluegrass jam spills out into the parking lot. ' +
      `SUPER: EchoFest. Five cities. One weekend. Presented by ${SPONSOR}.`,
  },
  india: {
    id: 'india',
    label: 'India tour',
    name: 'EchoFest · tour',
    home: 'Delhi',
    away: 'Chennai',
    homeFlavour: 'Delhi',
    budgetText: '₹10L',
    brief: {
      product: 'EchoFest, a touring live-music festival (fictional)',
      brand: 'EchoFest',
      audience: '18–34',
      cities: ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata'],
      locked: [SPONSOR],
      sourceCity: 'Delhi',
      campaignType: 'product',
      goal: 'Sell tickets for a five-city music festival tour with one hero film, versioned per city.',
    },
    script:
      'EchoFest is coming. Open on a packed Delhi farmhouse lawn at dusk as a dhol-heavy Punjabi pop headliner takes the stage. ' +
      'The crowd breaks into bhangra. Between sets, friends queue at Old Delhi chaat stalls. ' +
      'Late at night, a Bollywood DJ set lights up the arena. ' +
      `SUPER: EchoFest. Five cities. One weekend. Presented by ${SPONSOR}.`,
  },

  // Creator tours: a fictional solo creator with no ad team. The prompts are what a creator would type.
  'creator-us': {
    id: 'creator-us',
    kind: 'creator',
    label: 'Creator tour (US)',
    name: 'Thrift fits · creator tour',
    home: 'Atlanta',
    away: 'New York',
    homeFlavour: 'Atlanta',
    budgetText: '$500',
    brief: { product: '', audience: '18–24', market: 'United States', currency: 'USD', cities: [], sourceCity: 'Atlanta', campaignType: 'product' },
    script: 'I post thrift-fit TikToks from Atlanta. Where else would they land?',
  },
  'creator-india': {
    id: 'creator-india',
    kind: 'creator',
    label: 'Creator tour (India)',
    name: 'Street food Reels · creator tour',
    home: 'Delhi',
    away: 'Kochi',
    homeFlavour: 'Delhi',
    budgetText: '₹20K',
    brief: { product: '', audience: '18–24', market: 'India', currency: 'INR', cities: [], sourceCity: 'Delhi', campaignType: 'product' },
    script: 'I make street food Reels in Delhi. Which cities would love my content next?',
  },
}

export const SPONSOR_NAME = SPONSOR
