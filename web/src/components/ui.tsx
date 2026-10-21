import { useEffect, useState, type ReactNode } from 'react'
import { metaOf } from '../lib/agents'
import { api } from '../lib/api'
import { band, BAND_BG, BAND_TEXT } from '../lib/engine/scoring'
import { useStore } from '../lib/store'
import type { StepAgent } from '../lib/types'

export function ClapperIcon({ className = 'h-6 w-6', open = false }: { className?: string; open?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="13" width="26" height="16" rx="2" fill="currentColor" />
      <g style={{ transform: open ? 'rotate(-14deg)' : 'rotate(0deg)', transformOrigin: '3px 12px', transition: 'transform 200ms' }}>
        <rect x="3" y="6" width="26" height="6" rx="1" fill="currentColor" />
        <path d="M7 6h4l-3 6H4zM15 6h4l-3 6h-4zM23 6h4l-3 6h-4z" fill="#F2EEE5" />
      </g>
      <circle cx="24" cy="21" r="3" fill="#FF2E1F" />
    </svg>
  )
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const t = size === 'lg' ? 'text-[28px]' : 'text-[22px]'
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <ClapperIcon className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} />
      <span className={`font-display ${t} font-black uppercase leading-none tracking-[0.02em]`}>
        Action<span className="text-tally">.</span>AI
      </span>
    </span>
  )
}

let healthCache: Promise<boolean> | null = null

/** Live backend status: Qloo + Gemini reachable through the server. */
export function StatusPill() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    healthCache ??= api
      .health()
      .then((h) => h.qloo && h.gemini)
      .catch(() => false)
    let live = true
    healthCache.then((v) => live && setOk(v))
    return () => {
      live = false
    }
  }, [])
  return (
    <span
      title={ok === false ? 'The Action AI server is unreachable, so the agents cannot run.' : 'Taste data from Qloo; reading and writing by Gemini.'}
      className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2 sm:inline-flex"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok === null ? 'bg-ink-3' : ok ? 'bg-fit-high' : 'bg-fit-low'}`} />
      {ok === null ? 'Connecting' : ok ? 'Qloo · Gemini live' : 'Server offline'}
    </span>
  )
}

export function AgentTag({ agent, className = '' }: { agent: StepAgent; className?: string }) {
  const m = metaOf(agent)
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink ${className}`}>
      <span className="grid h-4 w-4 place-items-center rounded-[3px] bg-ink text-[10px] leading-none text-chalk">{m.glyph}</span>
      {m.name}
    </span>
  )
}

export function Score({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const s = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl', xl: 'text-5xl' }[size]
  return <span className={`font-display font-extrabold tabular-nums leading-none ${s} ${BAND_TEXT[band(value)]}`}>{value}</span>
}

export function FitDot({ value }: { value: number }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${BAND_BG[band(value)]}`} />
}

export function FitBar({ value, ghost }: { value: number; ghost?: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
      {ghost !== undefined && <div className="absolute inset-y-0 left-0 rounded-full bg-ink/10" style={{ width: `${ghost}%` }} />}
      <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${BAND_BG[band(value)]}`} style={{ width: `${value}%` }} />
    </div>
  )
}

export function Footnote({ n, evidenceId }: { n: number; evidenceId: string }) {
  const open = useStore((s) => s.openEvidence)
  const active = useStore((s) => s.evidenceId === evidenceId)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        open(active ? null : evidenceId)
      }}
      title="See the Qloo data behind this"
      className={`mx-0.5 inline-grid h-[15px] min-w-[15px] -translate-y-[2px] place-items-center rounded-[3px] px-[3px] align-middle font-mono text-[9px] font-semibold leading-none transition ${
        active ? 'bg-ink text-chalk' : 'bg-paper-2 text-ink-2 hover:bg-ink hover:text-chalk'
      }`}
    >
      {n}
    </button>
  )
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-2 ${className}`}>{children}</span>
}

export function Timecode({ className = '' }: { className?: string }) {
  const [t, setT] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const i = setInterval(() => setT(Date.now() - start), 1000 / 25)
    return () => clearInterval(i)
  }, [])
  const f = Math.floor(t / 40) % 25
  const s = Math.floor(t / 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return <span className={`font-mono tabular-nums ${className}`}>{`${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`}</span>
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="label text-ink-2">{children}</span>
      <span className="h-px flex-1 bg-line" />
      {right}
    </div>
  )
}
