export type AgentId = 'create' | 'test' | 'adapt' | 'spend' | 'grow'
export type StepAgent = AgentId | 'read'

/** India's default metros (kept for the tour and as the fallback market). Any city worldwide can be added. */
export const CITIES = ['Delhi', 'Mumbai', 'Chennai', 'Bengaluru', 'Kolkata', 'Lucknow']
export type City = string
export type CityScores = Record<string, number>

export interface Brief {
  product: string
  audience: string
  cities: City[]
  sourceCity?: City
  budget?: number
  goal?: string
  campaignType?: 'product' | 'cause'
  brand?: string
  competitors?: string[]
  audienceNote?: string
  deliverables?: string[]
  /** Elements that must stay the same everywhere: sponsors, logos, mandatory lines */
  locked?: string[]
  /** The country the campaign runs in, e.g. 'India', 'United States' */
  market?: string
  currency?: 'INR' | 'USD' | 'GBP' | 'EUR'
  /** Spend assumptions the team can override: audience (millions) and CPM (in the campaign currency) per region */
  reach?: Record<string, number>
  cpm?: Record<string, number>
}

export interface Signal {
  kind: 'entity' | 'tag'
  id: string
  name: string
  type: string
}

export type RefKind = 'entity' | 'tag' | 'proxy' | 'unmatched'
export type RefSource = 'script' | 'visual' | 'audio' | 'caption'
export type Prominence = 'hero' | 'support' | 'background'

/** One cultural cue pulled out of a creative, resolved (or not) to Qloo. */
export interface Reference {
  id: string
  cueId: string
  text: string
  label: string
  role: string
  source: RefSource
  at?: string | null
  kind: RefKind
  qlooId?: string | null
  qlooType?: string
  prominence: Prominence
  enabled: boolean
  scores: CityScores
  signals?: Signal[]
  evidenceId: string
}

export type CreativeFormat = 'script' | 'video' | 'reel' | 'image'

/** A creative's fingerprint: read once, reused by every agent. */
export interface Creative {
  id: string
  name: string
  format: CreativeFormat
  text: string
  refs: Reference[]
  parentId?: string
  adaptedFor?: City
  isPlaceholder?: boolean
}

export interface EvidenceEntity {
  name: string
  type: string
  id: string
  byCity: CityScores
}

export interface Evidence {
  id: string
  title: string
  claim: string
  entities: EvidenceEntity[]
  tags: { name: string; id: string }[]
  tagScores?: EvidenceEntity[]
  from?: { name: string; byCity: CityScores }
  calls: string[]
}

export interface SensitivityFlag {
  reason: string
  safer: string
}

export interface Swap {
  id: string
  refId: string
  from: string
  to: string
  why: string
  toScore: number
  toScores: CityScores
  toSignals?: Signal[]
  evidenceId: string
  status: 'pending' | 'accepted' | 'rejected'
  flag?: SensitivityFlag
  override?: string
  at?: string | null
}

// ── Create ──────────────────────────────────────────────

export interface ProfileItem {
  id: string
  name: string
  type: string
  description?: string | null
}

export interface CityProfile {
  city: City
  domains: { key: string; label: string; type: string; items: ProfileItem[] }[]
  tags: { id: string; name: string }[]
}

export interface CityWrite {
  insights: { text: string; basis: string[]; evidenceId: string | null }[]
  routes: { title: string; hook: string; script: string; insight: number; flag?: { reason: string; safer: string; category?: string } }[]
  collab: string
  production: { music: string; locations: string; wardrobe: string }
}

export interface Master {
  title: string
  script: string
  post?: { visual: string; on_image_text: string; caption: string; hashtags: string[]; flag?: SensitivityFlag | null } | null
  reels?: { title: string; hook: string; shots: string[]; audio: string; on_screen_text: string; length_seconds: number }[]
  flag?: SensitivityFlag | null
}

// ── Grow (creators) ─────────────────────────────────────

export interface GrowCreator {
  name: string
  id: string
  about?: string
  score: number
  evidenceId: string
}

/** One city's post plan for a creator growing into it. */
export interface GrowPlan {
  hook: string
  caption: string
  hashtags: string[]
  audio: string
  touch: { text: string; basis: string[]; evidenceId: string | null }
  creators: GrowCreator[]
  flag?: SensitivityFlag
}

export interface Persona {
  band: string
  likes: string[]
  tags: string[]
  reaction: string
}

export type TakeData =
  | { kind: 'readout'; creativeId: string }
  | { kind: 'test'; creativeIds: string[]; cities: City[] }
  | { kind: 'adapt'; sourceId: string; adaptedId: string; city: City; swaps: Swap[] }
  | { kind: 'spend'; budget: number; cities: City[]; creativeIds: string[] }
  | { kind: 'create'; cities: City[]; master?: Master }
  | { kind: 'grow'; creativeId?: string; home?: City; cities: City[]; targets: City[]; plans: Record<string, GrowPlan> }

export interface Take {
  id: string
  n: number
  agent: StepAgent
  title: string
  createdAt: number
  data: TakeData
}

export interface PlanStep {
  id: string
  agent: StepAgent
  label: string
  status: 'queued' | 'rolling' | 'done' | 'failed'
  log: string[]
  takeId?: string
  city?: City
}

export interface Plan {
  id: string
  steps: PlanStep[]
  startedAt: number
  finishedAt?: number
}

export interface QuestionOption {
  label: string
  value: string
  hint?: string
}

export interface Question {
  id: string
  field: 'cities' | 'sourceCity' | 'audience' | 'creative' | 'budget' | 'intent' | 'market'
  prompt: string
  options: QuestionOption[]
  multi?: boolean
  auto: string[]
  answer?: string[]
}

export interface Chip {
  label: string
  agent?: AgentId
  prompt: string
}

export interface Attachment {
  id: string
  name: string
  format: CreativeFormat
  size?: number
}

export interface Message {
  id: string
  role: 'user' | 'agent'
  agent?: StepAgent
  text: string
  attachments?: Attachment[]
  planId?: string
  questions?: Question[]
  questionsDone?: boolean
  pending?: { text: string; attachments: Attachment[]; pinned?: AgentId; nlu?: Understanding }
  chips?: Chip[]
  evidenceIds?: string[]
  error?: boolean
  createdAt: number
}

export interface Campaign {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  brief: Brief
  creatives: Record<string, Creative>
  takes: Take[]
  messages: Message[]
  plans: Record<string, Plan>
  evidence: Record<string, Evidence>
  profiles: Record<string, CityProfile>
  writes: Record<string, CityWrite>
  personas: Record<string, Persona[]>
  selectedTakeId?: string
  busy?: boolean
  /** A request on hold until the user attaches the ad it was about */
  awaiting?: { text: string; pinned?: AgentId; nlu?: Understanding }
}

/** What the router's language model pulled out of a request. */
export interface Understanding {
  intents: AgentId[]
  explain: boolean
  ask?: boolean
  regions: string[]
  source_region?: string | null
  budget?: number | null
  currency?: 'INR' | 'USD' | 'GBP' | 'EUR' | null
  market?: string | null
  audience?: string | null
  product?: string | null
  campaign_type?: 'product' | 'cause'
  is_script: boolean
  ask_question?: string | null
  script_text?: string | null
  rural?: boolean
  deliverables?: string[]
  audience_note?: string | null
  brand?: string | null
  competitors?: string[]
  constraints?: string[]
  focus?: string | null
  claims?: { thing: string; qloo_type: string; regions: string[] }[]
  questions?: {
    field: Question['field']
    prompt: string
    options: { label: string; value: string; hint?: string | null }[]
    multi?: boolean
    recommended: string[]
  }[]
}

export interface RouteStep {
  agent: StepAgent
  city?: City
  why: string
}

export interface RouteResult {
  kind: 'run' | 'explain' | 'ask'
  steps: RouteStep[]
  questions: Question[]
  budget?: number
  cities?: City[]
  sourceCity?: City
  pinned?: AgentId
  confidence: number
}
