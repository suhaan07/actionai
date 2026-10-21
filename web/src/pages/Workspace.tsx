import { Download, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { BriefPanel } from '../components/workspace/BriefPanel'
import { Canvas } from '../components/workspace/Canvas'
import { Chat, Composer } from '../components/workspace/Chat'
import { EvidenceDrawer } from '../components/workspace/EvidenceDrawer'
import { Logo, StatusPill } from '../components/ui'

export default function Workspace() {
  const { id = '' } = useParams()
  const c = useStore((s) => s.campaigns[id])
  const rename = useStore((s) => s.rename)
  const openEvidence = useStore((s) => s.openEvidence)
  const [pane, setPane] = useState<'chat' | 'canvas'>('chat')
  const [copied, setCopied] = useState(false)

  useEffect(() => () => openEvidence(null), [id, openEvidence])
  useEffect(() => {
    if (c?.takes.length) setPane('canvas')
  }, [c?.takes.length])

  if (!c) return <RemoteLoader id={id} />

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <Link to="/" aria-label="Home">
          <Logo />
        </Link>
        <span className="h-5 w-px bg-line" />
        <input
          key={c.name}
          defaultValue={c.name}
          onBlur={(e) => rename(c.id, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="min-w-0 max-w-[340px] flex-1 truncate rounded bg-transparent px-1.5 py-1 text-[14px] font-semibold hover:bg-paper-2 focus:bg-paper-3 focus:outline-none"
          aria-label="Campaign name"
        />
        <div className="ml-auto flex items-center gap-2">
          <StatusPill />
          <button
            className="btn hidden sm:inline-flex"
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/r/${c.id}`).catch(() => {})
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }}
          >
            <Link2 className="h-3.5 w-3.5" /> {copied ? 'Report link copied' : 'Share report'}
          </button>
          <button className="btn-ink" onClick={() => window.open(`/r/${c.id}?print=1`, '_blank')}>
            <Download className="h-3.5 w-3.5" /> Report PDF
          </button>
        </div>
      </header>

      <div className="flex shrink-0 border-b border-line md:hidden">
        {(['chat', 'canvas'] as const).map((p) => (
          <button key={p} onClick={() => setPane(p)} className={`flex-1 py-2 font-mono text-[11px] uppercase tracking-wider ${pane === p ? 'border-b-2 border-ink text-ink' : 'text-ink-3'}`}>
            {p === 'chat' ? 'Agents' : `Takes (${c.takes.length})`}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={`${pane === 'chat' ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-line bg-paper md:flex md:w-[380px]`}>
          <BriefPanel c={c} />
          <Chat c={c} />
          <Composer c={c} />
        </aside>
        <main className={`${pane === 'canvas' ? 'flex' : 'hidden'} min-w-0 flex-1 md:flex`}>
          <Canvas c={c} />
        </main>
        <EvidenceDrawer c={c} />
      </div>
    </div>
  )
}

function RemoteLoader({ id }: { id: string }) {
  const loadRemote = useStore((s) => s.loadRemote)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    loadRemote(id).then((ok) => !ok && setMissing(true))
  }, [id, loadRemote])
  if (missing) return <Navigate to="/" replace />
  return (
    <div className="grid h-full place-items-center">
      <p className="label">Loading campaign…</p>
    </div>
  )
}
