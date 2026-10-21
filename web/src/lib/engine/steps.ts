// Each agent step calls the backend, streams progress lines to the shot list, then returns a function that
// applies its result to the campaign.
import { AGENTS } from '../agents'
import { api } from '../api'
import { audienceOf, currencyOf, defaultCpm, exampleBudget, marketOf, money, SAMPLE_SCRIPT } from '../regions'
import { type Attachment, type Campaign, type Chip, type City, type Creative, type PlanStep, type Take, type TakeData, type Understanding } from '../types'
import { uid } from '../uid'
import { buildAdapted } from './reader'
import { fitOrNull, homeCity, splitBudget } from './scoring'

export interface StepCtx {
  text: string
  attachments: Attachment[]
  usePlaceholder?: boolean
  nlu: Understanding
  newIds: string[]
  /** Script written by Create in this plan, read next for scoring */
  generated?: { title: string; script: string }
}

export type Log = (line: string) => void
export type Apply = (c: Campaign) => { takeId?: string; summary: string; chips?: Chip[]; evidenceIds?: string[] }

const originals = (c: Campaign) => Object.values(c.creatives).filter((x) => !x.parentId)
/** Only a focus the user actually typed in this message (never one inferred from earlier turns). */
const focusFrom = (ctx: StepCtx) => {
  const f = ctx.nlu.focus?.trim()
  if (!f) return null
  const said = ctx.text.toLowerCase()
  return f.toLowerCase().split(/\W+/).some((w) => w.length > 3 && said.includes(w)) ? f : null
}

/** The most recent master script Create wrote, if any. */
const latestMaster = (c: Campaign) => {
  const t = [...c.takes].reverse().find((x) => x.data.kind === 'create' && x.data.master)
  return t && t.data.kind === 'create' ? t.data.master : undefined
}

export const campaignCities = (c: Campaign): City[] => (c.brief.cities.length ? c.brief.cities : [...marketOf(c.brief).cities])
/** Score in the default metros plus anything the campaign added, so later questions have data. */
export const allRegions = (c: Campaign): City[] => Array.from(new Set([...marketOf(c.brief).cities, ...c.brief.cities]))

const briefPayload = (c: Campaign, ctx?: StepCtx) => ({
  product: c.brief.product || ctx?.nlu.product || '',
  brand: c.brief.brand || ctx?.nlu.brand || '',
  competitors: (c.brief.competitors ?? ctx?.nlu.competitors ?? []).join(', '),
  audience_note: c.brief.audienceNote || ctx?.nlu.audience_note || '',
  deliverables: (ctx?.nlu.deliverables?.length ? ctx.nlu.deliverables : c.brief.deliverables ?? []).join(', '),
  request: ctx?.text ?? '',
  audience: c.brief.audience,
  goal: c.brief.goal || ctx?.text || '',
  campaign_type: c.brief.campaignType || ctx?.nlu.campaign_type || 'product',
})

function addTake(c: Campaign, agent: Take['agent'], title: string, data: TakeData): string {
  const take: Take = { id: uid('take'), n: c.takes.length + 1, agent, title, createdAt: Date.now(), data }
  c.takes.push(take)
  c.selectedTakeId = take.id
  return take.id
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const KIND: Record<string, string> = { entity: 'Qloo entity', tag: 'Qloo genre tag', proxy: 'scored via', unmatched: 'no Qloo match' }

export async function runStep(c: Campaign, step: PlanStep, ctx: StepCtx, log: Log): Promise<Apply> {
  switch (step.agent) {
    case 'read':
      return read(c, ctx, log)
    case 'test':
      return test(c, ctx, log)
    case 'adapt':
      return adapt(c, step.city!, ctx, log)
    case 'spend':
      return spend(c, log)
    case 'create':
      return createStep(c, ctx, log)
    case 'grow':
      return grow(c, ctx, log)
  }
}

async function read(c: Campaign, ctx: StepCtx, log: Log): Promise<Apply> {
  const regions = allRegions(c)
  const inputs: { text?: string; attachment?: Attachment; placeholder?: boolean; name?: string; niche?: boolean }[] = ctx.generated
    ? [{ text: ctx.generated.script, name: ctx.generated.title }]
    : ctx.attachments.length
    ? ctx.attachments.slice(0, 3).map((a) => ({ attachment: a, text: ctx.nlu.is_script ? ctx.nlu.script_text || ctx.text : undefined }))
    : ctx.nlu.is_script && !ctx.usePlaceholder
      ? [{ text: ctx.nlu.script_text || ctx.text }]
      : latestMaster(c)
        ? [{ text: latestMaster(c)!.script, name: latestMaster(c)!.title }]
        : ctx.nlu.intents.includes('grow') && !ctx.usePlaceholder
          ? [{ text: ctx.text, name: 'What you make', niche: true }]
          : [{ text: SAMPLE_SCRIPT, placeholder: true }]

  const results: Awaited<ReturnType<typeof api.read>>[] = []
  for (const inp of inputs) {
    const label = inp.attachment?.name ?? inp.name ?? (inp.placeholder ? 'the sample script' : 'your script')
    log(`Reading ${label} with Gemini${inp.attachment && inp.attachment.format !== 'script' ? ' (visuals, speech, music)' : ''}`)
    const res = await api.read({ text: inp.text, attachment: inp.attachment, regions, name: inp.placeholder ? 'Sample script' : inp.name, niche: inp.niche })
    if (inp.placeholder) res.creative.isPlaceholder = true
    log(`Found ${res.creative.refs.length} cultural references`)
    for (const r of res.creative.refs.slice(0, 4)) {
      log(`"${r.label}" → ${KIND[r.kind]}${r.kind === 'unmatched' ? '' : ' ' + (r.signals ?? []).map((s) => s.name).slice(0, 2).join(', ')}`)
    }
    log(`Scored in ${regions.length} regions from Qloo heatmaps`)
    results.push(res)
  }

  return (cc) => {
    let takeId: string | undefined
    for (const { creative, evidence } of results) {
      cc.creatives[creative.id] = creative
      for (const e of evidence) cc.evidence[e.id] = e
      ctx.newIds.push(creative.id)
      takeId = addTake(cc, 'read', `Read-out · ${creative.name}`, { kind: 'readout', creativeId: creative.id })
    }
    const n = results.reduce((a, r) => a + r.creative.refs.length, 0)
    const unmatched = results.reduce((a, r) => a + r.creative.refs.filter((x) => x.kind === 'unmatched').length, 0)
    return {
      takeId,
      summary: `Read ${results.length > 1 ? `${results.length} ads` : 'the ad'}: ${n} references${unmatched ? `, ${unmatched} with no Qloo match` : ''}. Check the read-out; untick anything we got wrong.`,
    }
  }
}

/** Fill in scores for regions a creative was never scored in (e.g. a town added later). */
async function ensureScores(creatives: Creative[], cities: City[], log: Log): Promise<Record<string, Record<string, Record<string, number>>>> {
  const out: Record<string, Record<string, Record<string, number>>> = {}
  for (const cr of creatives) {
    const missing = cities.filter((city) => !cr.refs.some((r) => r.scores[city] !== undefined) && cr.refs.some((r) => r.signals?.length))
    if (!missing.length || cr.parentId) continue
    log(`Scoring ${cr.name} in ${list(missing)} with Qloo`)
    const res = await api.rescore(cr.refs, missing)
    out[cr.id] = res.scores
  }
  return out
}

function mergeScores(c: Campaign, extra: Record<string, Record<string, Record<string, number>>>) {
  for (const [cid, byRef] of Object.entries(extra)) {
    const cr = c.creatives[cid]
    if (!cr) continue
    for (const r of cr.refs) if (byRef[r.id]) r.scores = { ...r.scores, ...byRef[r.id] }
  }
}

async function test(c: Campaign, ctx: StepCtx, log: Log): Promise<Apply> {
  const ids = ctx.newIds.length ? [...ctx.newIds] : Object.values(c.creatives).slice(-3).reverse().map((x) => x.id)
  const cities = campaignCities(c)
  const creatives = ids.map((id) => c.creatives[id]).filter(Boolean) as Creative[]
  log(`Checking ${creatives.length} ad${creatives.length > 1 ? 's' : ''} across ${cities.length} regions`)
  const extra = await ensureScores(creatives, cities, log)
  const local = structuredClone(c)
  mergeScores(local, extra)
  const lead = local.creatives[ids[0]]
  for (const city of cities.slice(0, 6)) {
    const s = fitOrNull(lead, city)
    log(`${city} · ${s === null ? 'no Qloo data' : `fit ${s}`}`)
  }

  return (cc) => {
    mergeScores(cc, extra)
    const takeId = addTake(cc, 'test', creatives.length > 1 ? `Test · ${creatives.length} ads` : 'Test · fit per region', { kind: 'test', creativeIds: ids, cities })
    const scores = cities
      .map((city) => ({ city, s: fitOrNull(cc.creatives[ids[0]], city) }))
      .filter((x): x is { city: City; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
    if (!scores.length) return { takeId, summary: 'Qloo has no data for these regions yet. Try nearby cities.' }
    const weak = scores.filter((x) => x.s < 50).map((x) => x.city)
    const chips: Chip[] = []
    if (weak.length) chips.push({ label: `Adapt for ${list(weak.slice(0, 2))}`, agent: 'adapt', prompt: `Make it work in ${list(weak.slice(0, 2))}` })
    chips.push({ label: 'Plan spend', agent: 'spend', prompt: `Split ${money(exampleBudget(currencyOf(cc.brief)), currencyOf(cc.brief))} across ${list(cities)}` })
    return {
      takeId,
      summary: `Fits best in ${scores[0].city} (${scores[0].s}), weakest in ${scores.at(-1)!.city} (${scores.at(-1)!.s}).${weak.length ? ` ${list(weak)} score under 50.` : ''}`,
      chips,
    }
  }
}

async function adapt(c: Campaign, city: City, ctx: StepCtx, log: Log): Promise<Apply> {
  const source = (ctx.newIds.length && c.creatives[ctx.newIds[0]]) || originals(c).at(-1) || Object.values(c.creatives).at(-1)!
  const regions = Array.from(new Set([...allRegions(c), city]))
  // The original city is never the one we are adapting for.
  const named = c.brief.sourceCity && c.brief.sourceCity !== city ? c.brief.sourceCity : undefined
  const home = named ? { city: named, score: fitOrNull(source, named) ?? 0 } : homeCity(source, regions.filter((r) => r !== city))
  log(`Made for ${home.city}: it fits there best (${home.score})`)
  log(`Asking Qloo what ${city}'s audience over-indexes on`)
  const locked = c.brief.locked ?? []
  if (locked.length) log(`Keeping ${list(locked)} unchanged`)
  if (focusFrom(ctx)) log(`Focusing on ${focusFrom(ctx)}`)
  const res = await api.adapt({
    creative: source,
    source: home.city,
    target: city,
    audience: c.brief.audience,
    regions,
    brief: briefPayload(c, ctx),
    instructions: ctx.text,
    locked,
    focus: focusFrom(ctx),
  })
  const swaps = res.swaps
  log(`${swaps.length} reference${swaps.length === 1 ? '' : 's'} hold a different cultural slot in ${city}`)
  for (const s of swaps.slice(0, 3)) log(`"${s.from}" → "${s.to}"`)
  const flagged = swaps.filter((s) => s.flag).length
  log(flagged ? `Sensitivity check flagged ${flagged} swap${flagged > 1 ? 's' : ''} for review` : 'Sensitivity check: no flags')

  const adaptedId = uid('cr')
  // A focused element the reader hadn't listed comes back as a new reference on the source ad.
  const src: Creative = res.newRefs?.length ? { ...source, refs: [...source.refs, ...res.newRefs] } : source
  const before = fitOrNull(src, city) ?? 0
  const potential = fitOrNull(buildAdapted(src, swaps.map((s) => ({ ...s, status: 'accepted' as const })), city, adaptedId), city) ?? before
  const reply = res.reply?.trim()

  return (cc) => {
    for (const e of res.evidence) cc.evidence[e.id] = e
    if (res.newRefs?.length && cc.creatives[source.id]) cc.creatives[source.id].refs.push(...res.newRefs)
    if (swaps.length) cc.creatives[adaptedId] = buildAdapted(src, swaps, city, adaptedId)
    const takeId = addTake(cc, 'adapt', `Adapt · ${city}`, { kind: 'adapt', sourceId: source.id, adaptedId, city, swaps })
    if (!swaps.length) return { takeId, summary: reply || `Nothing to swap for ${city}: either it already fits (${before}) or Qloo found no stronger local equivalent.` }
    const tally = `${swaps.length} swap${swaps.length === 1 ? '' : 's'} proposed for ${city}: fit ${before} → ${potential} if accepted.${flagged ? ` ${flagged} need${flagged === 1 ? 's' : ''} a human call.` : ''}`
    return {
      takeId,
      summary: reply ? `${reply}\n\n${tally}` : tally,
      chips: [
        { label: `Re-test the ${city} version`, agent: 'test', prompt: `Test the ${city} version` },
        { label: 'Plan spend', agent: 'spend', prompt: `Split ${money(exampleBudget(currencyOf(cc.brief)), currencyOf(cc.brief))} across ${list(campaignCities(cc))}` },
      ],
    }
  }
}

async function spend(c: Campaign, log: Log): Promise<Apply> {
  const cur = currencyOf(c.brief)
  const budget = c.brief.budget ?? exampleBudget(cur)
  const cities = campaignCities(c)
  const creatives = Object.values(c.creatives)
  log(`Fit matrix: ${creatives.length} creative${creatives.length > 1 ? 's' : ''} × ${cities.length} regions`)
  const extra = await ensureScores(creatives, cities, log)
  const missing = cities.filter((x) => !c.profiles[x])
  let profiles: Campaign['profiles'] = {}
  if (missing.length) {
    log(`Pulling targeting interests and public figures from Qloo`)
    profiles = (await api.profiles(missing, c.brief.audience, {}, false)).profiles
  }
  log('Weighting by audience size and CPM, 10% floor per region')

  return (cc) => {
    mergeScores(cc, extra)
    Object.assign(cc.profiles, profiles)
    const rows = splitBudget(Object.values(cc.creatives), cities, budget, { reach: cc.brief.reach, cpm: cc.brief.cpm, defaultCpm: defaultCpm(cc.brief) })
    const flagged = rows.filter((r) => r.flag)
    const takeId = addTake(cc, 'spend', `Spend · ${money(budget, cur)}`, { kind: 'spend', budget, cities, creativeIds: Object.keys(cc.creatives) })
    const top = [...rows].sort((a, b) => b.amount - a.amount)[0]
    return {
      takeId,
      summary: `Starting split for ${money(budget, cur)}: the most goes to ${top.city} (${money(top.amount, cur)}).${flagged.length ? ` Fix ${list(flagged.map((f) => f.city))} before you spend there.` : ''} Shift it after 3–5 days of real results.`,
      chips: flagged.map((f) => ({ label: `Fix ${f.city} in Adapt`, agent: 'adapt' as const, prompt: `Make it work in ${f.city}` })),
    }
  }
}

async function createStep(c: Campaign, ctx: StepCtx, log: Log): Promise<Apply> {
  const cities = campaignCities(c)
  log(`Pulling Qloo taste profiles for ${list(cities)}`)
  log('Writing insights and routes with Gemini, using only Qloo data')
  if (ctx.nlu.claims?.length) log(`Checking your assumption${ctx.nlu.claims.length > 1 ? 's' : ''} with Qloo: ${ctx.nlu.claims.map((x) => x.thing).join(', ')}`)
  const res = await api.profiles(cities, c.brief.audience, { ...briefPayload(c, ctx), claims: ctx.nlu.claims ?? [] }, true)
  const routes = Object.values(res.writes).flatMap((w) => w.routes)
  const flagged = routes.filter((r) => r.flag).length
  log(`Sensitivity check on ${routes.length} routes: ${flagged ? `${flagged} flagged` : 'no flags'}`)
  const master = res.master ?? undefined
  if (master) {
    log(`Wrote the master script "${master.title}"${master.post ? ' and an Instagram post design' : ''}`)
    ctx.generated = { title: master.title, script: master.script }
  }

  return (cc) => {
    Object.assign(cc.profiles, res.profiles)
    Object.assign(cc.writes, res.writes)
    for (const e of res.evidence) cc.evidence[e.id] = e
    const got = Object.keys(res.writes)
    const takeId = addTake(cc, 'create', master ? `Create · ${master.title}` : `Create · ${got.length} region${got.length === 1 ? '' : 's'}`, { kind: 'create', cities: got.length ? got : cities, master })
    return {
      takeId,
      summary: `${res.reply ? `${res.reply}\n\n` : ''}${master ? `Master script "${master.title}"${master.post ? ' and an Instagram post' : ''}, plus ` : ''}${got.length} taste profiles, ${got.length * 3} insights and ${routes.length} routes, each tied to the Qloo data behind it.${flagged ? ` ${flagged} route${flagged > 1 ? 's' : ''} flagged for review.` : ''}`,
      evidenceIds: res.replyEvidence ?? [],
      chips: [{ label: 'Test an ad in these regions', agent: 'test', prompt: `Test my ad in ${list(got.length ? got : cities)}` }],
    }
  }
}

/** Rank cities for a creator: Qloo fit of their content, weighted by how many people are there. Home is never a target. */
export function growRanking(cr: Creative, cities: City[], home?: City, reach?: Record<string, number>) {
  return cities
    .map((city) => ({ city, fit: fitOrNull(cr, city), audience: audienceOf(city, reach) }))
    .filter((x): x is { city: City; fit: number; audience: number } => x.fit !== null)
    .map((x) => ({ ...x, home: x.city === home, potential: Math.round((x.fit / 100) ** 2 * Math.sqrt(x.audience) * 100) }))
    .sort((a, b) => b.potential - a.potential)
}

async function grow(c: Campaign, ctx: StepCtx, log: Log): Promise<Apply> {
  const market = marketOf(c.brief)
  const cities = Array.from(new Set([...c.brief.cities, ...market.cities, ...market.more]))
  const cr = (ctx.newIds.length && c.creatives[ctx.newIds.at(-1)!]) || originals(c).at(-1)
  if (!cr) throw new Error('Nothing to grow from yet. Attach a Reel or post, or say what you make.')
  log(`Checking where your content lands across ${cities.length} cities`)
  const extra = await ensureScores([cr], cities, log)
  const local = structuredClone(cr)
  for (const r of local.refs) if (extra[cr.id]?.[r.id]) r.scores = { ...r.scores, ...extra[cr.id][r.id] }

  const named = ctx.nlu.source_region ?? c.brief.sourceCity
  const home = named && fitOrNull(local, named) !== null ? named : homeCity(local, cities).city
  const ranked = growRanking(local, cities, home, c.brief.reach)
  const targets = ranked.filter((x) => !x.home && x.fit >= 50).slice(0, 3).map((x) => x.city)
  const picks = targets.length ? targets : ranked.filter((x) => !x.home).slice(0, 2).map((x) => x.city)
  log(`${home} is home (fit ${fitOrNull(local, home)})`)
  log(`Best next cities: ${list(picks.map((x) => `${x} (${fitOrNull(local, x)})`))}`)
  log('Writing a hook, caption, hashtags and audio for each from Qloo taste data')
  log('Finding local creators each city over-indexes on')
  const fits = Object.fromEntries(ranked.map((x) => [x.city, x.fit]))
  const res = await api.grow({ creative: local, niche: ctx.text, home, targets: picks, regions: cities, fits, audience: c.brief.audience || '18–24', brief: briefPayload(c, ctx) })
  const flagged = Object.values(res.cities).filter((p) => p.flag).length
  log(flagged ? `Sensitivity check flagged ${flagged} plan${flagged > 1 ? 's' : ''} for review` : 'Sensitivity check: no flags')

  return (cc) => {
    mergeScores(cc, extra)
    Object.assign(cc.profiles, res.profiles)
    for (const e of res.evidence) cc.evidence[e.id] = e
    if (!cc.brief.sourceCity) cc.brief.sourceCity = home
    const got = picks.filter((x) => res.cities[x])
    const takeId = addTake(cc, 'grow', `Grow · ${got.length ? list(got) : 'next cities'}`, { kind: 'grow', creativeId: cr.id, home, cities, targets: got, plans: res.cities })
    const weak = ranked.filter((x) => !x.home && x.fit < 50 && x.audience >= 3).slice(0, 1).map((x) => x.city)
    const chips: Chip[] = got.slice(0, 1).map((x) => ({ label: `Rewrite it for ${x}`, agent: 'adapt' as const, prompt: `Make it work in ${x}` }))
    if (weak.length) chips.push({ label: `Crack ${weak[0]}`, agent: 'adapt', prompt: `Make it work in ${weak[0]}` })
    chips.push({ label: 'Plan a small boost', agent: 'spend', prompt: `Split ${money(exampleBudget(currencyOf(cc.brief)) / 40, currencyOf(cc.brief))} to boost it across ${list([home, ...got])}` })
    return {
      takeId,
      summary: res.reply || `Your content lands best in ${home}. Grow next into ${list(got)}.`,
      chips,
    }
  }
}

export async function explain(c: Campaign, question: string, cities: City[]): Promise<{ text: string; evidenceIds: string[]; chips: Chip[] }> {
  const creative = originals(c).at(-1) ?? Object.values(c.creatives).at(-1)
  if (!creative) return { text: 'Nothing to explain yet. Run an agent first.', evidenceIds: [], chips: [] }
  const res = await api.explain(question, creative, `Campaign regions: ${campaignCities(c).join(', ')}`)
  const evidenceIds = res.ref_ids.map((id) => creative.refs.find((r) => r.id === id)?.evidenceId).filter(Boolean) as string[]
  const pool = cities.length ? cities : campaignCities(c)
  const weakest = [...pool].sort((a, b) => (fitOrNull(creative, a) ?? 100) - (fitOrNull(creative, b) ?? 100))[0]
  return {
    text: res.text,
    evidenceIds: evidenceIds.slice(0, 4),
    chips: weakest ? [{ label: `Make it work in ${weakest}`, agent: 'adapt', prompt: `Make it work in ${weakest}` }] : [],
  }
}

/** Free-form questions answered from Qloo (e.g. brand ambassadors), no agent run needed. */
export async function askQloo(c: Campaign, question: string, cities: City[]) {
  const regions = cities.length ? cities : campaignCities(c)
  return api.ask(question, briefPayload(c), regions, c.brief.audience || undefined)
}

export const stepLabel = (agent: PlanStep['agent'], city?: City) =>
  agent === 'read' ? 'Read the ad' : agent === 'adapt' ? (city ? `Adapt for ${city}` : 'Adapt weak regions') : `${AGENTS[agent].name}`

/** Regions where the latest ad fits weakly (adapt targets when none were named). */
export function weakRegions(c: Campaign, max = 3): City[] {
  const latest = originals(c).at(-1)
  if (!latest) return []
  return campaignCities(c)
    .map((city) => ({ city, s: fitOrNull(latest, city) }))
    .filter((x): x is { city: City; s: number } => x.s !== null && x.s < 50)
    .sort((a, b) => a.s - b.s)
    .slice(0, max)
    .map((x) => x.city)
}
