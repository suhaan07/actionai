import { ImageIcon, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { api, API_URL } from '../../lib/api'

const RATIO: Record<string, string> = { '4:5': 'aspect-[4/5]', '9:16': 'aspect-[9/16]', '1:1': 'aspect-square', '16:9': 'aspect-video' }

/** An AI-rendered frame for an ad. The image carries no text; headlines are overlaid here so they are always spelled right. */
export function Mockup({
  text,
  city,
  kind = 'post',
  aspect = '4:5',
  headline,
  label,
  className = '',
  tourId,
}: {
  text: string
  city?: string
  kind?: string
  aspect?: '4:5' | '9:16' | '1:1' | '16:9'
  headline?: string
  label?: string
  className?: string
  tourId?: string
}) {
  const [state, setState] = useState<{ img?: string; prompt?: string; err?: string; busy?: boolean }>({})
  const go = async () => {
    setState({ busy: true })
    try {
      const r = await api.mockup(text, city, kind, aspect)
      setState({ img: API_URL + r.image, prompt: r.prompt })
    } catch (e) {
      setState({ err: e instanceof Error ? e.message : 'Could not make the mock-up.' })
    }
  }

  return (
    <div className={className}>
      {label && <p className="label mb-1.5">{label}</p>}
      <div className={`relative w-full overflow-hidden rounded-md bg-ink ${RATIO[aspect]}`}>
        {state.img ? (
          <>
            <img src={state.img} alt={state.prompt ?? 'AI mock-up'} className="absolute inset-0 h-full w-full object-cover" />
            {headline && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pt-16">
                <p className="font-display text-[26px] font-black uppercase leading-[0.95] text-white drop-shadow">{headline}</p>
              </div>
            )}
          </>
        ) : (
          <button
            data-tour={tourId}
            onClick={go}
            disabled={state.busy}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-chalk transition hover:bg-chalk/5 disabled:cursor-wait"
          >
            {state.busy ? (
              <>
                <span className="tally-blink h-2.5 w-2.5 rounded-full bg-tally" />
                <span className="font-mono text-[11px] uppercase tracking-wider">Rendering…</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-6 w-6 opacity-70" />
                <span className="font-display text-[18px] font-black uppercase tracking-wide">Generate mock-up</span>
                <span className="px-6 text-center font-mono text-[10px] text-chalk-3">{city ? `Set in ${city}` : 'From this brief'} · AI image, text added by Action AI</span>
              </>
            )}
          </button>
        )}
        {state.img && (
          <button onClick={go} title="Render again" className="absolute right-2 top-2 rounded bg-black/50 p-1.5 text-white hover:bg-black/70" aria-label="Render again">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {state.err && <p className="mt-1.5 text-[12px] text-fit-low">{state.err}</p>}
    </div>
  )
}
