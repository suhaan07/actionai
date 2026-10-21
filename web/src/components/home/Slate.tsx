import { ArrowUpRight, Mic, Paperclip, X } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { AGENTS } from '../../lib/agents'
import type { AgentId } from '../../lib/types'
import { Timecode } from '../ui'
import type { usePrompt } from '../usePrompt'

type Prompt = ReturnType<typeof usePrompt>

/** The prompt box as a clapperboard slate. Pressing ACTION snaps the clapper shut. */
export function Slate({ prompt, onAction }: { prompt: Prompt; onAction: () => void }) {
  const [clapping, setClapping] = useState(false)
  const { text, setText, attachments, setAttachments, pinned, setPinned, fileRef, onFiles, mentionOptions, pickMention, canSend } = prompt
  const meta = pinned ? AGENTS[pinned] : undefined
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase()

  const fire = () => {
    if (!canSend || clapping) return
    setClapping(true)
    setTimeout(onAction, 620)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOptions.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault()
      pickMention(mentionOptions[0])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      fire()
    }
  }

  return (
    <div className="relative mx-auto mt-8 w-full max-w-3xl">
      {/* clapper stick */}
      <div className="relative z-10 h-11 px-1">
        <div
          className={`clapper-stripes h-full rounded-t-md border-2 border-ink shadow-[0_2px_0_rgba(20,18,16,0.4)] ${clapping ? 'clap' : ''}`}
          style={{ transformOrigin: '6px 100%', transform: clapping ? undefined : 'rotate(-3.2deg)', transition: 'transform 300ms' }}
        />
        <span className="absolute bottom-0 left-0 h-3 w-3 translate-y-1/2 rounded-full border-2 border-ink bg-chalk" />
      </div>

      {/* slate body */}
      <div className="relative rounded-b-xl rounded-tr-xl bg-ink text-chalk shadow-slate">
        <div className="grid grid-cols-2 border-b border-chalk/15 sm:grid-cols-4">
          <Field k="Prod." v="New campaign" />
          <Field
            k="Scene"
            v={
              meta ? (
                <button onClick={() => setPinned(undefined)} className="group inline-flex items-center gap-1.5 text-chalk" title="Unpin, and let the router pick">
                  {meta.scene} {meta.name.toUpperCase()}
                  <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
              ) : (
                <span className="text-chalk-2">AUTO · ROUTER PICKS</span>
              )
            }
          />
          <Field k="Date" v={date} className="hidden sm:block" />
          <Field k="TC" v={<Timecode className="text-chalk" />} className="hidden sm:block" last />
        </div>

        <div className="relative px-5 pb-3 pt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={3}
            autoFocus
            placeholder={meta?.placeholder ?? 'Drop an ad, a brief or a budget, and say what you need…'}
            className="w-full resize-none bg-transparent font-sans text-[17px] leading-relaxed text-chalk placeholder:text-chalk-3 focus:outline-none"
            aria-label="Tell the agents what you need"
          />
          {mentionOptions.length > 0 && (
            <div className="absolute left-5 top-full z-20 -mt-2 w-56 overflow-hidden rounded-md border border-chalk/20 bg-ink-4 shadow-slate">
              {mentionOptions.map((a) => (
                <button key={a} onClick={() => pickMention(a)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-chalk/10">
                  <span className="font-mono text-xs text-chalk-2">{AGENTS[a].glyph}</span>
                  <span className="font-semibold">{AGENTS[a].name}</span>
                  <span className="truncate text-xs text-chalk-3">{AGENTS[a].line}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} accept="video/*,image/*,.txt,.pdf,.doc,.docx" />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-chalk/20 px-2.5 py-1.5 text-xs text-chalk-2 transition hover:border-chalk/50 hover:text-chalk"
            >
              <Paperclip className="h-3.5 w-3.5" /> Script · video · image · Reel
            </button>
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-chalk/10 px-2 py-1 font-mono text-[11px] text-chalk">
                <span className="uppercase text-chalk-3">{a.format}</span> {a.name}
                <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`}>
                  <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                </button>
              </span>
            ))}
            <span className="ml-auto" />
            <button className="rounded-md p-2 text-chalk-3 transition hover:text-chalk" title="Voice input (coming soon)" aria-label="Voice input">
              <Mic className="h-4 w-4" />
            </button>
            <button
              data-tour="slate-action"
              onClick={fire}
              disabled={!canSend}
              className="group inline-flex items-center gap-2 rounded-md bg-chalk py-2 pl-3 pr-3.5 font-display text-[17px] font-black uppercase tracking-[0.06em] text-ink transition enabled:hover:bg-white disabled:opacity-35"
            >
              <span className={`h-2 w-2 rounded-full bg-tally ${canSend ? 'tally-blink' : ''}`} />
              Action
              <ArrowUpRight className="h-4 w-4 transition group-enabled:group-hover:-translate-y-0.5 group-enabled:group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {clapping && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="action-flash font-display text-7xl font-black uppercase tracking-tight text-chalk sm:text-8xl">
              Action<span className="text-tally">!</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ k, v, className = '', last }: { k: string; v: ReactNode; className?: string; last?: boolean }) {
  return (
    <div className={`border-chalk/15 px-5 py-2.5 ${last ? '' : 'sm:border-r'} ${className}`}>
      <div className="chalk-label">{k}</div>
      <div className="mt-0.5 truncate font-mono text-[12px] font-medium tracking-wide">{v}</div>
    </div>
  )
}

export const pinLine = (a: AgentId) => `${AGENTS[a].glyph} ${AGENTS[a].name}: you bring ${AGENTS[a].bring.toLowerCase()} → you get ${AGENTS[a].get.toLowerCase()}.`
