import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { api, ApiError } from './api'
import { buildAdapted } from './engine/reader'
import { route, understandLocally } from './engine/router'
import { askQloo, campaignCities, explain, runStep, stepLabel, weakRegions, type StepCtx } from './engine/steps'
import type { AgentId, Attachment, Brief, Campaign, City, Message, Plan, PlanStep, Swap, Understanding } from './types'
import { uid } from './uid'

export interface SubmitInput {
  text: string
  attachments: Attachment[]
  pinned?: AgentId
}

interface State {
  campaigns: Record<string, Campaign>
  order: string[]
  evidenceId: string | null
  loadingPersonas: Record<string, boolean>
  createCampaign: (init?: { name?: string; brief?: Brief }) => string
  deleteCampaign: (id: string) => void
  rename: (id: string, name: string) => void
  updateBrief: (id: string, patch: Partial<Brief>) => void
  submit: (id: string, input: SubmitInput) => void
  answer: (id: string, msgId: string, answers: Record<string, string[]>) => void
  selectTake: (id: string, takeId: string) => void
  openEvidence: (evId: string | null) => void
  toggleRef: (id: string, creativeId: string, refId: string) => void
  updateSwap: (id: string, takeId: string, swapId: string, patch: Partial<Swap>) => void
  loadPersonas: (id: string, creativeId: string, city: City) => void
  stop: (id: string) => void
  loadRemote: (id: string) => Promise<boolean>
}

const blankCampaign = (): Campaign => ({
  id: uid('cmp'),
  name: 'Untitled campaign',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  brief: { product: '', audience: '', cities: [] },
  creatives: {},
  takes: [],
  messages: [],
  plans: {},
  evidence: {},
  profiles: {},
  writes: {},
  personas: {},
})

const msg = (m: Omit<Message, 'id' | 'createdAt'>): Message => ({ id: uid('msg'), createdAt: Date.now(), ...m })

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again in a moment.')

// Each run captures its campaign's generation; Stop bumps it, so a stopped run's late results are dropped.
const generation = new Map<string, number>()
const gen = (id: string) => generation.get(id) ?? 0

// Campaigns are saved to the server (debounced) so share links work across devices.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const context = (c: Campaign) => {
  const creatives = Object.values(c.creatives)
  const said = c.messages.filter((m) => m.role === 'user' && m.text).slice(-4, -1).map((m) => `"${m.text.slice(0, 220)}"`)
  const lastReply = [...c.messages].reverse().find((m) => m.role === 'agent' && m.text && !m.questions)
  return [
    creatives.length ? `${creatives.length} ad(s) already read: ${creatives.map((x) => x.name).join(', ')}` : 'no ads yet',
    c.takes.length ? `results so far: ${c.takes.map((t) => t.data.kind).join(', ')}` : 'no results yet',
    c.brief.cities.length ? `regions: ${c.brief.cities.join(', ')}` : '',
    c.brief.market ? `market: ${c.brief.market}` : '',
    c.brief.product ? `product: ${c.brief.product}` : '',
    said.length ? `earlier messages from the user: ${said.join(' | ')}` : '',
    lastReply ? `last agent reply: "${lastReply.text.slice(0, 220)}"` : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const save = (id: string) => {
        clearTimeout(saveTimers.get(id))
        saveTimers.set(
          id,
          setTimeout(() => {
            const c = get().campaigns[id]
            if (c) api.putCampaign({ ...c, busy: false }).catch(() => {})
          }, 1500),
        )
      }

      const mutate = (id: string, fn: (c: Campaign) => void) => {
        set((s) => {
          const prev = s.campaigns[id]
          if (!prev) return s
          const c = structuredClone(prev)
          fn(c)
          c.updatedAt = Date.now()
          return { campaigns: { ...s.campaigns, [id]: c } }
        })
        save(id)
      }

      const understand = async (c: Campaign, text: string): Promise<Understanding> => {
        if (!text.trim()) return { intents: [], explain: false, regions: [], is_script: false }
        try {
          return await api.understand(text, context(c))
        } catch {
          return understandLocally(text)
        }
      }

      const process = async (id: string, input: SubmitInput, usePlaceholder = false, nluIn?: Understanding) => {
        mutate(id, (c) => (c.busy = true))
        const started = gen(id)
        const nlu = nluIn ?? (await understand(get().campaigns[id], input.text))
        if (gen(id) !== started) return
        mutate(id, (cc) => {
          if (nlu.regions.length && !nlu.explain && !nlu.ask) cc.brief.cities = Array.from(new Set([...cc.brief.cities, ...nlu.regions]))
          if (nlu.budget) cc.brief.budget = nlu.budget
        })
        const c = get().campaigns[id]
        if (nlu.product && !c.brief.product) mutate(id, (cc) => (cc.brief.product = nlu.product!))
        // If the model wants to confirm the audience (e.g. a children's product), let the question decide.
        const asksAudience = (nlu.questions ?? []).some((q) => q.field === 'audience')
        if (nlu.audience && !c.brief.audience && !asksAudience) mutate(id, (cc) => (cc.brief.audience = nlu.audience!))
        if (nlu.campaign_type) mutate(id, (cc) => (cc.brief.campaignType = nlu.campaign_type))
        mutate(id, (cc) => {
          if (nlu.brand && !cc.brief.brand) cc.brief.brand = nlu.brand
          if (nlu.competitors?.length && !cc.brief.competitors?.length) cc.brief.competitors = nlu.competitors
          if (nlu.audience_note && !cc.brief.audienceNote) cc.brief.audienceNote = nlu.audience_note
          if (nlu.deliverables?.length && !cc.brief.deliverables?.length) cc.brief.deliverables = nlu.deliverables
          if (nlu.market && !cc.brief.market) cc.brief.market = nlu.market
          if (nlu.currency && !cc.brief.currency) cc.brief.currency = nlu.currency
          if (nlu.constraints?.length) cc.brief.locked = Array.from(new Set([...(cc.brief.locked ?? []), ...nlu.constraints]))
        })
        if (!c.brief.goal && input.text && !nlu.explain) mutate(id, (cc) => (cc.brief.goal = input.text.slice(0, 600)))

        const r = route({ campaign: get().campaigns[id], text: input.text, attachments: input.attachments, nlu, pinned: input.pinned, usePlaceholder })

        if (r.kind === 'ask') {
          try {
            const res = await askQloo(get().campaigns[id], input.text, r.cities ?? [])
            if (gen(id) !== started) return
            mutate(id, (cc) => {
              for (const e of res.evidence) cc.evidence[e.id] = e
              cc.messages.push(msg({ role: 'agent', agent: res.agent, text: res.text, evidenceIds: res.evidence.map((e) => e.id) }))
            })
          } catch (e) {
            mutate(id, (cc) => cc.messages.push(msg({ role: 'agent', text: errText(e), error: true })))
          }
          mutate(id, (cc) => (cc.busy = false))
          return
        }
        if (r.kind === 'explain') {
          try {
            const ex = await explain(get().campaigns[id], input.text, r.cities ?? [])
            if (gen(id) !== started) return
            mutate(id, (cc) => cc.messages.push(msg({ role: 'agent', agent: 'test', text: ex.text, evidenceIds: ex.evidenceIds, chips: ex.chips })))
          } catch (e) {
            mutate(id, (cc) => cc.messages.push(msg({ role: 'agent', text: errText(e), error: true })))
          }
          mutate(id, (cc) => (cc.busy = false))
          return
        }
        if (r.questions.length) {
          mutate(id, (cc) => {
            cc.busy = false
            cc.messages.push(msg({ role: 'agent', text: 'A few quick calls before we roll.', questions: r.questions, pending: { ...input, nlu } }))
          })
          return
        }
        if (r.sourceCity) mutate(id, (cc) => (cc.brief.sourceCity = r.sourceCity))
        await run(id, r.steps, r.cities ?? [], r.budget, input, usePlaceholder, nlu)
        // The same message may also ask a lookup question ("…and which creators can I target?"): answer it after the run.
        if (nlu.ask && nlu.intents.length && gen(id) === started) {
          mutate(id, (cc) => (cc.busy = true))
          try {
            const res = await askQloo(get().campaigns[id], nlu.ask_question || input.text, r.cities ?? [])
            if (gen(id) !== started) return
            mutate(id, (cc) => {
              for (const e of res.evidence) cc.evidence[e.id] = e
              cc.messages.push(msg({ role: 'agent', agent: res.agent, text: res.text, evidenceIds: res.evidence.map((e) => e.id) }))
            })
          } catch (e) {
            mutate(id, (cc) => cc.messages.push(msg({ role: 'agent', text: errText(e), error: true })))
          }
          mutate(id, (cc) => (cc.busy = false))
        }
      }

      const run = async (
        id: string,
        routeSteps: { agent: PlanStep['agent']; city?: City }[],
        cities: City[],
        budget: number | undefined,
        input: SubmitInput,
        usePlaceholder: boolean,
        nlu: Understanding,
      ) => {
        const plan: Plan = {
          id: uid('plan'),
          startedAt: Date.now(),
          steps: routeSteps.map((s) => ({ id: uid('st'), agent: s.agent, city: s.city, label: stepLabel(s.agent, s.city), status: 'queued', log: [] })),
        }
        mutate(id, (c) => {
          c.plans[plan.id] = plan
          c.busy = true
          c.brief.cities = Array.from(new Set([...c.brief.cities, ...cities]))
          if (budget) c.brief.budget = budget
          // Creators growing their reach default to Gen Z; ad campaigns to young adults.
          if (!c.brief.audience) c.brief.audience = nlu.intents.includes('grow') ? '18–24' : '22–35'
          c.messages.push(msg({ role: 'agent', text: '', planId: plan.id }))
        })

        if (!plan.steps.length) {
          mutate(id, (c) => {
            delete c.plans[plan.id]
            c.messages = c.messages.filter((m) => m.planId !== plan.id)
            c.busy = false
            c.messages.push(msg({ role: 'agent', text: 'I couldn’t work out what to run for that. Try naming the agent with @ (for example @adapt), the city, and what should change.', error: true }))
          })
          return
        }

        const ctx: StepCtx = { text: input.text, attachments: input.attachments, usePlaceholder, nlu, newIds: [] }
        let chips: Message['chips'] = []
        const mine = gen(id)

        for (let i = 0; i < plan.steps.length; i++) {
          let step = plan.steps[i]
          if (step.agent === 'adapt' && !step.city) {
            // Expand into one step per weakly fitting region, now that the ad has been scored.
            const weak = weakRegions(get().campaigns[id])
            const expanded: PlanStep[] = weak.map((city) => ({ id: uid('st'), agent: 'adapt', city, label: stepLabel('adapt', city), status: 'queued', log: [] }))
            plan.steps.splice(i, 1, ...expanded)
            mutate(id, (c) => c.plans[plan.id].steps.splice(i, 1, ...structuredClone(expanded)))
            if (!expanded.length) {
              mutate(id, (c) => c.messages.push(msg({ role: 'agent', agent: 'adapt', text: 'Every region scores 50 or more, so nothing needs adapting.' })))
              i--
              continue
            }
            step = plan.steps[i]
          }
          if (gen(id) !== mine) break
          mutate(id, (c) => (c.plans[plan.id].steps[i].status = 'rolling'))
          try {
            const apply = await runStep(get().campaigns[id], step, ctx, (line) => gen(id) === mine && mutate(id, (c) => c.plans[plan.id].steps[i].log.push(line)))
            if (gen(id) !== mine) break
            mutate(id, (c) => {
              const out = apply(c)
              const st = c.plans[plan.id].steps[i]
              st.status = 'done'
              st.takeId = out.takeId
              c.messages.push(msg({ role: 'agent', agent: step.agent, text: out.summary, evidenceIds: out.evidenceIds }))
              chips = out.chips ?? chips
            })
          } catch (e) {
            if (gen(id) !== mine) break
            mutate(id, (c) => {
              c.plans[plan.id].steps[i].status = 'failed'
              c.plans[plan.id].steps[i].log.push(errText(e))
              c.messages.push(msg({ role: 'agent', agent: step.agent, text: `${stepLabel(step.agent, step.city)} stopped: ${errText(e)}`, error: true, chips: [{ label: 'Try again', prompt: input.text, agent: input.pinned }] }))
            })
            chips = []
            break
          }
        }

        if (gen(id) !== mine) return
        mutate(id, (c) => {
          c.plans[plan.id].finishedAt = Date.now()
          c.busy = false
          if (chips?.length) c.messages[c.messages.length - 1].chips = chips
        })
      }

      return {
        campaigns: {},
        order: [],
        evidenceId: null,
        loadingPersonas: {},

        createCampaign: (init) => {
          const c = blankCampaign()
          if (init?.name) c.name = init.name
          if (init?.brief) c.brief = structuredClone(init.brief)
          set((s) => ({ campaigns: { ...s.campaigns, [c.id]: c }, order: [c.id, ...s.order] }))
          return c.id
        },

        deleteCampaign: (id) =>
          set((s) => {
            const { [id]: _gone, ...rest } = s.campaigns
            return { campaigns: rest, order: s.order.filter((x) => x !== id) }
          }),

        rename: (id, name) => mutate(id, (c) => (c.name = name.trim() || 'Untitled campaign')),

        updateBrief: (id, patch) => mutate(id, (c) => Object.assign(c.brief, patch)),

        submit: (id, input) => {
          const c = get().campaigns[id]
          if (!c || c.busy) return
          mutate(id, (cc) => {
            cc.messages.push(msg({ role: 'user', text: input.text, attachments: input.attachments }))
            if (cc.name === 'Untitled campaign') {
              const t = input.text.replace(/@\w+/g, '').trim()
              cc.name = t ? (t.length > 44 ? `${t.slice(0, 42)}…` : t) : input.attachments[0]?.name ?? cc.name
            }
          })
          const held = c.awaiting
          const brings = input.attachments.length > 0 || input.text.length > 160
          if (held && brings) {
            // Continue the request that was waiting for this ad.
            mutate(id, (cc) => (cc.awaiting = undefined))
            const text = input.text.trim() ? `${held.text}\n\n${input.text}` : held.text
            const nlu = held.nlu && !input.text.trim() ? { ...held.nlu, is_script: false, questions: [] } : undefined
            void process(id, { text, attachments: input.attachments, pinned: input.pinned ?? held.pinned }, false, nlu).catch((e) =>
              mutate(id, (cc) => {
                cc.busy = false
                cc.messages.push(msg({ role: 'agent', text: errText(e), error: true }))
              }),
            )
            return
          }
          if (held && input.text.trim()) mutate(id, (cc) => (cc.awaiting = undefined))
          void process(id, input).catch((e) =>
            mutate(id, (cc) => {
              cc.busy = false
              cc.messages.push(msg({ role: 'agent', text: errText(e), error: true }))
            }),
          )
        },

        answer: (id, msgId, answers) => {
          const c = get().campaigns[id]
          const m = c?.messages.find((x) => x.id === msgId)
          if (!m?.questions || !m.pending) return
          let pinned = m.pending.pinned
          let usePlaceholder = false
          let attach = false
          mutate(id, (cc) => {
            const mm = cc.messages.find((x) => x.id === msgId)!
            mm.questionsDone = true
            for (const q of mm.questions!) {
              const a = answers[q.id] ?? q.auto
              q.answer = a
              if (q.field === 'cities' || q.field === 'market') cc.brief.cities = Array.from(new Set(a.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean))))
              if (q.field === 'sourceCity') cc.brief.sourceCity = a[0]
              if (q.field === 'audience') cc.brief.audience = a[0]
              if (q.field === 'budget') cc.brief.budget = Number(a[0])
              if (q.field === 'intent') pinned = a[0] as AgentId
              if (q.field === 'creative') {
                if (a[0] === 'attach') attach = true
                else usePlaceholder = true
              }
            }
            if (attach) {
              cc.awaiting = { text: m.pending!.text, pinned, nlu: m.pending!.nlu }
              cc.messages.push(msg({ role: 'agent', text: `Attach the ad with the paperclip below, or paste the script, and send. I'll pick up "${m.pending!.text.slice(0, 80)}${m.pending!.text.length > 80 ? '…' : ''}" from there.` }))
            }
          })
          if (!attach)
            void process(id, { text: m.pending.text, attachments: m.pending.attachments, pinned }, usePlaceholder, m.pending.nlu).catch((e) =>
              mutate(id, (cc) => {
                cc.busy = false
                cc.messages.push(msg({ role: 'agent', text: errText(e), error: true }))
              }),
            )
        },

        selectTake: (id, takeId) => mutate(id, (c) => (c.selectedTakeId = takeId)),

        openEvidence: (evId) => set({ evidenceId: evId }),

        toggleRef: (id, creativeId, refId) =>
          mutate(id, (c) => {
            const r = c.creatives[creativeId]?.refs.find((x) => x.id === refId)
            if (r) r.enabled = !r.enabled
          }),

        updateSwap: (id, takeId, swapId, patch) =>
          mutate(id, (c) => {
            const t = c.takes.find((x) => x.id === takeId)
            if (t?.data.kind !== 'adapt') return
            const d = t.data
            const sw = d.swaps.find((s) => s.id === swapId)
            if (!sw) return
            Object.assign(sw, patch)
            const source = c.creatives[d.sourceId]
            if (source) c.creatives[d.adaptedId] = buildAdapted(source, d.swaps, d.city, d.adaptedId)
          }),

        loadPersonas: (id, creativeId, city) => {
          const key = `${creativeId}:${city}`
          const c = get().campaigns[id]
          const creative = c?.creatives[creativeId]
          if (!creative || c.personas[key] || get().loadingPersonas[key]) return
          set((s) => ({ loadingPersonas: { ...s.loadingPersonas, [key]: true } }))
          api
            .personas(city, c.brief.audience, creative)
            .then((res) => mutate(id, (cc) => (cc.personas[key] = res.personas)))
            .catch(() => mutate(id, (cc) => (cc.personas[key] = [])))
            .finally(() => set((s) => ({ loadingPersonas: { ...s.loadingPersonas, [key]: false } })))
        },

        stop: (id) => {
          generation.set(id, gen(id) + 1)
          mutate(id, (c) => {
            if (!c.busy) return
            c.busy = false
            for (const p of Object.values(c.plans)) {
              if (p.finishedAt) continue
              p.finishedAt = Date.now()
              for (const st of p.steps) {
                if (st.status === 'rolling') {
                  st.status = 'failed'
                  st.log.push('Stopped')
                } else if (st.status === 'queued') st.status = 'failed'
              }
            }
            c.messages.push(msg({ role: 'agent', text: 'Stopped. Nothing from the unfinished step was applied. Edit your message and send it again, or ask something else.' }))
          })
        },

        loadRemote: async (id) => {
          try {
            const c = await api.getCampaign(id)
            c.busy = false
            set((s) => ({ campaigns: { ...s.campaigns, [id]: c }, order: s.order.includes(id) ? s.order : [id, ...s.order] }))
            return true
          } catch {
            return false
          }
        },
      }
    },
    {
      name: 'action-ai',
      version: 2,
      storage: createJSONStorage(() => {
        try {
          return localStorage
        } catch {
          return sessionStorage
        }
      }),
      partialize: (s) => ({ campaigns: s.campaigns, order: s.order }),
      // v1 campaigns were built on mock data; start clean.
      migrate: () => ({ campaigns: {}, order: [] }) as unknown as State,
      onRehydrateStorage: () => (s) => {
        if (!s) return
        for (const c of Object.values(s.campaigns)) {
          c.busy = false
          for (const p of Object.values(c.plans)) for (const st of p.steps) if (st.status === 'rolling' || st.status === 'queued') st.status = 'failed'
        }
      },
    },
  ),
)

export { campaignCities }
