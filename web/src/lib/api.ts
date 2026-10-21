// Backend client. Every Qloo and Gemini call goes through the FastAPI server; no keys in the browser.
import type { AgentId, Attachment, Campaign, CityProfile, CityWrite, Creative, Evidence, Master, Persona, Swap, Understanding } from './types'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    r = await fetch(API_URL + path, init)
  } catch {
    throw new ApiError('Can\'t reach the Action AI server. Check that the backend is running.')
  }
  if (!r.ok) {
    let detail = `${r.status}`
    try {
      detail = (await r.json()).detail ?? detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return r.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Files picked in the browser, kept out of persisted state. */
export const fileStore = new Map<string, File>()

export interface Health {
  ok: boolean
  qloo: boolean
  gemini: boolean
  model: string
  supabase: { enabled: boolean; cache: boolean; campaigns: boolean }
}

export const api = {
  health: () => call<Health>('/health'),

  understand: (text: string, context: string) => post<Understanding>('/api/understand', { text, context }),

  read: (input: { text?: string; attachment?: Attachment; regions: string[]; name?: string }) => {
    const f = new FormData()
    f.set('text', input.text ?? '')
    f.set('format', input.attachment?.format ?? 'script')
    f.set('name', input.name ?? input.attachment?.name ?? '')
    f.set('regions_json', JSON.stringify(input.regions))
    const file = input.attachment && fileStore.get(input.attachment.id)
    if (input.attachment && !file) throw new ApiError(`${input.attachment.name} is no longer in memory. Attach it again.`)
    if (file) f.set('file', file)
    return call<{ creative: Creative; evidence: Evidence[] }>('/api/read', { method: 'POST', body: f })
  },

  rescore: (refs: Creative['refs'], regions: string[]) => post<{ scores: Record<string, Record<string, number>> }>('/api/rescore', { refs, regions }),

  profiles: (regions: string[], audience: string | undefined, brief: Record<string, unknown>, write: boolean) =>
    post<{ profiles: Record<string, CityProfile>; writes: Record<string, CityWrite>; evidence: Evidence[]; master?: Master | null; reply?: string; replyEvidence?: string[] }>('/api/profiles', { regions, audience, brief, write }),

  personas: (region: string, audience: string | undefined, creative: Creative) =>
    post<{ city: string; personas: Persona[] }>('/api/personas', { region, audience, creative }),

  adapt: (body: {
    creative: Creative
    source?: string
    target: string
    audience?: string
    regions: string[]
    brief: Record<string, unknown>
    instructions?: string
    locked?: string[]
    focus?: string | null
  }) => post<{ swaps: Swap[]; evidence: Evidence[]; reply?: string; newRefs?: Creative['refs'] }>('/api/adapt', body),

  explain: (question: string, creative: Creative | undefined, extra = '') => post<{ text: string; ref_ids: string[] }>('/api/explain', { question, creative, extra }),

  ask: (question: string, brief: Record<string, unknown>, regions: string[], audience?: string) =>
    post<{ text: string; agent: AgentId; evidence: Evidence[] }>('/api/ask', { question, brief, regions, audience }),

  mockup: (text: string, city: string | undefined, kind: string, aspect: string) =>
    post<{ image: string; prompt: string }>('/api/mockup', { text, city, kind, aspect }),

  resolveRegion: (q: string) => call<{ name: string; lat: number; lon: number; kind: string }>(`/api/regions/resolve?q=${encodeURIComponent(q)}`),

  getCampaign: (id: string) => call<Campaign>(`/api/campaigns/${id}`),

  putCampaign: (c: Campaign) => call<{ ok: boolean }>(`/api/campaigns/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }),
}
