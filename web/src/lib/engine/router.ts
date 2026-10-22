// Router: turns a request into a shot list. The language understanding comes from Gemini (/api/understand);
// the keyword rules below are only a fallback when the server can't be reached.
import { ALL_PRESETS, exampleBudget, marketOf, MARKETS, money } from '../regions'
import { CITIES, type AgentId, type Attachment, type Campaign, type City, type Question, type RouteResult, type RouteStep, type Understanding } from '../types'
import { uid } from '../uid'
import { looksLikeScript } from './reader'
import { fitOrNull } from './scoring'

const KNOWN = ALL_PRESETS
const ALIASES: Record<string, City> = { bangalore: 'Bengaluru', bombay: 'Mumbai', calcutta: 'Kolkata', madras: 'Chennai', nyc: 'New York', 'bay area': 'San Francisco' }

function detectCities(text: string): City[] {
  const l = text.toLowerCase()
  const out = new Set<City>()
  for (const c of KNOWN) if (l.includes(c.toLowerCase())) out.add(c)
  for (const [k, v] of Object.entries(ALIASES)) if (l.includes(k)) out.add(v)
  if (/\b(all|every|six) (six )?cit(y|ies)\b/.test(l)) for (const c of CITIES) out.add(c)
  return KNOWN.filter((c) => out.has(c))
}

function detectSource(text: string): City | undefined {
  for (const c of KNOWN) {
    const n = c.toLowerCase()
    if (new RegExp(`(from ${n}\\b|\\b${n}[\\s-]+(ad|reel|video|script|creative|spot|film|cut|post|version|coded)\\b)`, 'i').test(text)) return c
  }
}

function detectBudget(text: string): number | undefined {
  const m = text.match(/(₹|rs\.?\s?|inr\s?|\$|£|€|usd\s?|gbp\s?)?\s?(\d+(?:\.\d+)?)\s?(lakhs?|lacs?|l|k|cr|crores?|m|mn|million)?\b/i)
  if (!m) return
  const [, cur, num, unit] = m
  if (!cur && !unit) return
  const n = parseFloat(num)
  const u = (unit ?? '').toLowerCase()
  if (u.startsWith('la') || u === 'l') return n * 1e5
  if (u === 'k') return n * 1e3
  if (u.startsWith('cr')) return n * 1e7
  if (u === 'm' || u.startsWith('mn') || u.startsWith('mil')) return n * 1e6
  return n
}

const INTENTS: Record<AgentId, RegExp> = {
  create: /\b(ideas?|insights?|brief|concepts?|routes?|launch|what do .* love|create|collab|campaign)\b/i,
  test: /\b(test|pre-?test|score|fit|will (?:\S+\s){0,4}(?:work|land|fit)|compare|which (one|version)|check|re-?test)\b/i,
  adapt: /\b(adapt|transcreat\w*|locali[sz]\w*|make (?:\S+\s){0,4}(?:work|land|fit)|version for|rework|swap)\b/i,
  spend: /\b(spend|budget|split|allocate|boost|media plan|where should i (spend|run))\b/i,
  grow: /\b(grow|followers|my (reels?|content|page|channel|videos?|posts?)|reach (more|new)|go viral)\b/i,
}

/** Fallback understanding when /api/understand is unreachable. */
export function understandLocally(text: string): Understanding {
  const intents: Understanding['intents'] = (Object.keys(INTENTS) as AgentId[]).filter((a) => INTENTS[a].test(text))
  if (/\b(deep dive|who (does|will) (it|this|the ad) (really )?(reach|speak)|podcasts? to sponsor|partner with|pop-?ups?)\b/i.test(text)) intents.push('deep')
  const budget = detectBudget(text)
  if (budget && !intents.includes('spend')) intents.push('spend')
  const source = detectSource(text)
  return {
    intents,
    explain: /^(why|how come|what makes|explain)\b/i.test(text.trim()),
    regions: detectCities(text).filter((c) => !(intents.includes('adapt') && c === source)),
    source_region: source,
    budget,
    is_script: looksLikeScript(text),
  }
}

export function mentionedAgent(text: string): AgentId | undefined {
  const m = text.match(/@(create|test|adapt|spend|grow)\b/i)
  return m ? (m[1].toLowerCase() as AgentId) : undefined
}

export interface RouteInput {
  campaign: Campaign
  text: string
  attachments: Attachment[]
  nlu: Understanding
  pinned?: AgentId
  usePlaceholder?: boolean
}

export function route({ campaign, text, attachments, nlu, pinned, usePlaceholder }: RouteInput): RouteResult {
  const brief = campaign.brief
  const mention = mentionedAgent(text) ?? pinned
  const cities = nlu.regions
  // If the language model missed an amount that is plainly in the message ("Split ₹20K…"), read it from the text.
  const budget = nlu.budget ?? detectBudget(text) ?? brief.budget
  const market = marketOf({ ...brief, market: nlu.market ?? brief.market, cities: cities.length ? cities : brief.cities })
  const hasCreative = Object.keys(campaign.creatives).length > 0
  // A master script Create wrote counts as the campaign's ad: it gets read on demand instead of asking for one.
  const hasMaster = campaign.takes.some((t) => t.data.kind === 'create' && !!t.data.master)
  const newScript = nlu.is_script && !nlu.intents.includes('create')
  const newCreative = attachments.length > 0 || newScript
  const questions: Question[] = []

  if (!mention && !newCreative && nlu.explain && campaign.takes.length) {
    return { kind: 'explain', steps: [], questions: [], cities, confidence: 0.9 }
  }
  // A plain question Qloo data can answer (ambassadors, collabs, what an audience likes): no agents to run.
  if (!mention && !newCreative && (nlu.ask || (nlu.explain && !campaign.takes.length)) && !nlu.intents.length) {
    // Never guess a market for a lookup: ask where first.
    if (!cities.length && !brief.cities.length && !(nlu.market ?? brief.market)) {
      return {
        kind: 'run',
        steps: [],
        questions: [
          {
            id: uid('q'),
            field: 'market',
            prompt: 'Which market should I look at?',
            options: Object.values(MARKETS).map((m) => ({ label: `${m.name}: ${m.cities.slice(0, 4).join(', ')}…`, value: m.cities.join(',') })),
            auto: [MARKETS.India.cities.join(',')],
          },
        ],
        confidence: 0.6,
      }
    }
    return { kind: 'ask', steps: [], questions: [], cities, confidence: 0.85 }
  }

  // A deep dive is a step, not an agent: it runs after the ad is read and tested.
  const wantsDeep = nlu.intents.includes('deep')
  let intents: AgentId[] = nlu.intents.filter((i): i is AgentId => i !== 'deep')
  if (nlu.budget && !intents.includes('spend')) intents.push('spend')
  if (mention) intents = Array.from(new Set([mention, ...intents.filter((i) => i === 'spend' && mention !== 'create')]))
  if (!intents.length && !wantsDeep) {
    if (newCreative) intents = ['test']
    else if (cities.length && !hasCreative) intents = ['create']
  }

  if (!intents.length && !wantsDeep) {
    questions.push({
      id: uid('q'),
      field: 'intent',
      prompt: 'What should the agents do with this?',
      options: [
        { label: '✦ Create', value: 'create', hint: 'Ideas from a brief' },
        { label: '◎ Test', value: 'test', hint: 'Score an ad per region' },
        { label: '⇄ Adapt', value: 'adapt', hint: 'Make an ad work elsewhere' },
        { label: '▤ Spend', value: 'spend', hint: 'Split a budget' },
        { label: '↗ Grow', value: 'grow', hint: 'Creators: where your content lands next' },
      ],
      auto: [hasCreative ? 'test' : 'create'],
    })
    return { kind: 'run', steps: [], questions, confidence: 0.3 }
  }

  // Grow works from a Reel or post, or just from what the creator says they make.
  const grows = intents.includes('grow')
  const needsCreative = wantsDeep || intents.some((i) => i !== 'create' && i !== 'grow')
  const writes = intents.includes('create') && (nlu.deliverables ?? []).some((d) => d === 'script' || d === 'social_post' || d === 'video' || d === 'reel')
  // Questions the language model wrote for this request, minus anything we already know.
  const known = {
    cities: cities.length > 0 || brief.cities.length > 0,
    market: cities.length > 0 || brief.cities.length > 0 || !!(nlu.market ?? brief.market),
    audience: !!brief.audience,
    budget: !!budget,
    // Once an ad is scored, its home region is known from the data, so never ask for it.
    sourceCity: !!(nlu.source_region ?? brief.sourceCity) || hasCreative || newCreative,
    intent: intents.length > 0,
  }
  for (const q of nlu.questions ?? []) {
    if (known[q.field as keyof typeof known] || questions.some((x) => x.field === q.field) || !q.options.length) continue
    questions.push({
      id: uid('q'),
      field: q.field,
      prompt: q.prompt,
      options: q.options.map((o) => ({ label: o.label, value: o.value, hint: o.hint ?? undefined })),
      multi: q.field === 'cities' || !!q.multi,
      auto: q.recommended.length ? q.recommended : [q.options[0].value],
    })
  }
  if (needsCreative && !hasCreative && !hasMaster && !newCreative && !usePlaceholder && !writes) {
    questions.push({
      id: uid('q'),
      field: 'creative',
      prompt: 'Which ad should the agents work on?',
      options: [
        { label: 'I\'ll attach it', value: 'attach', hint: 'Use + to add a script, image, video or Reel, or paste the script' },
        { label: 'Use a sample script', value: 'placeholder', hint: 'A short wedding-film script, to try the agents' },
      ],
      auto: ['placeholder'],
    })
  }

  let targetCities: City[] = cities.length ? cities : brief.cities
  // Grow scans the whole market itself; the campaign keeps only home and the cities Grow suggests, so a later boost or
  // pre-test isn't spread across every city it looked at.
  const home = nlu.source_region ?? brief.sourceCity
  const growReady = grows && !!(nlu.market || brief.market || targetCities.length || home)
  if (growReady && home && !targetCities.includes(home)) targetCities = [home, ...targetCities]
  if (!targetCities.length && !growReady && !questions.some((q) => q.field === 'cities' || q.field === 'market')) {
    if (!nlu.market && !brief.market) {
      questions.push({
        id: uid('q'),
        field: 'market',
        prompt: 'Which market is this campaign for?',
        options: Object.values(MARKETS).map((m) => ({ label: `${m.name}: ${m.cities.slice(0, 4).join(', ')}…`, value: m.cities.join(',') })),
        auto: [MARKETS.India.cities.join(',')],
      })
    } else {
      const opts = Array.from(new Set([...market.cities, ...market.more]))
      questions.push({
        id: uid('q'),
        field: 'cities',
        prompt: intents.includes('adapt') ? 'Which regions should the ad work in?' : 'Which regions are you looking at?',
        options: opts.map((c) => ({ label: c, value: c })),
        multi: true,
        auto: intents.includes('adapt') ? market.cities.slice(2, 4) : [...market.cities],
      })
    }
  }

  if ((intents.includes('create') || intents.includes('test')) && !grows && !brief.audience && !nlu.audience && !questions.some((q) => q.field === 'audience') && questions.length < 3) {
    questions.push({
      id: uid('q'),
      field: 'audience',
      prompt: 'Who is the audience?',
      options: ['18–24', '22–35', '25–44', '35+'].map((a) => ({ label: a, value: a })),
      auto: ['22–35'],
    })
  }

  // The city an ad was made for is never asked: once the ad is scored, Adapt uses the city it fits best
  // (or the one the user named) and says so in the shot list.
  // A city the user asks to adapt FOR is never the original: drop a stale or mistaken source that collides with a target.
  const rawSource = nlu.source_region ?? brief.sourceCity
  const source = rawSource && intents.includes('adapt') && cities.includes(rawSource) ? undefined : rawSource

  if (intents.includes('spend') && !budget && !questions.some((q) => q.field === 'budget') && questions.length < 3) {
    questions.push({
      id: uid('q'),
      field: 'budget',
      prompt: 'What is the total budget?',
      options: [0.25, 1, 2.5, 5].map((k) => {
        const b = exampleBudget(market.currency) * k
        return { label: money(b, market.currency), value: String(b) }
      }),
      auto: [String(exampleBudget(market.currency))],
    })
  }

  if (questions.length) return { kind: 'run', steps: [], questions, confidence: 0.6 }

  // ── build the shot list ──
  const steps: RouteStep[] = []
  if (newCreative || (needsCreative && !hasCreative && !writes) || (grows && !hasCreative && !writes)) steps.push({ agent: 'read', why: grows && !newCreative ? 'read what you make' : 'read the ad once for every agent' })
  if (intents.includes('create')) steps.push({ agent: 'create', why: 'profile each region and write ideas' })
  if (writes && needsCreative) steps.push({ agent: 'read', why: 'read the new script for scoring' })

  const tested = campaign.takes.some((t) => t.data.kind === 'test')
  if (intents.includes('test') || ((intents.includes('adapt') || intents.includes('spend') || wantsDeep) && (newCreative || !tested))) {
    steps.push({ agent: 'test', why: intents.includes('test') ? 'score the ad per region' : 'needs fit scores first' })
  }

  if (intents.includes('adapt')) {
    const targets = targetCities.filter((c) => c !== source)
    const latest = Object.values(campaign.creatives).filter((c) => !c.parentId).at(-1)
    if (writes || (!latest && !targets.length) || (!nlu.regions.length && !targets.length)) {
      // The ad doesn't exist yet (or no target named): adapt whichever regions it turns out to fit weakly.
      steps.push({ agent: 'adapt', why: 'adapt the regions where it fits weakly' })
    } else {
      const list = !targets.length && latest ? targetCities.filter((c) => (fitOrNull(latest, c) ?? 100) < 50) : targets
      for (const city of list) steps.push({ agent: 'adapt', city, why: `swap references for ${city}` })
    }
  }
  if (intents.includes('spend')) steps.push({ agent: 'spend', why: 'split the budget by fit and audience' })
  if (grows) steps.push({ agent: 'grow', why: 'find where your content lands next' })
  if (wantsDeep) steps.push({ agent: 'deep', why: 'connect every Qloo signal about the ad' })

  targetCities = Array.from(new Set([...(source ? [source] : []), ...targetCities]))
  return { kind: 'run', steps, questions: [], budget: budget ?? undefined, cities: targetCities, sourceCity: source ?? undefined, pinned: mention, confidence: 0.86 }
}
