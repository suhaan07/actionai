import { useStore } from '../../lib/store'
import type { Campaign, Creative } from '../../lib/types'
import { Footnote } from '../ui'
import { HighlightedScript, KIND_LABEL, Panel, SOURCE_LABEL, Timeline } from './shared'

/** What the reader found in the ad. The team fixes it here before anything is scored. */
export function ReadoutView({ c, creative }: { c: Campaign; creative: Creative }) {
  const toggle = useStore((s) => s.toggleRef)
  const timed = creative.format === 'video' || creative.format === 'reel'
  const on = creative.refs.filter((r) => r.enabled && r.kind !== 'unmatched').length

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-5">
        {creative.isPlaceholder && (
          <p className="rounded-md border border-dashed border-line-2 px-3 py-2 font-mono text-[11px] text-ink-3">
            Sample script. Attach your own ad, or paste a script, to read it instead.
          </p>
        )}
        {timed && (
          <Panel title={`${creative.format} · cue timeline`}>
            <Timeline creative={creative} />
          </Panel>
        )}
        <Panel title={timed ? 'Transcript and scene notes' : 'Script'}>
          <HighlightedScript creative={creative} />
        </Panel>
      </div>

      <Panel title={`What we found (${creative.refs.length})`} right={<span className="font-mono text-[10.5px] text-ink-3">{on} scored</span>}>
        <ul className="-my-1 divide-y divide-line">
          {creative.refs.map((r, i) => (
            <li key={r.id} className={`flex items-start gap-3 py-2.5 ${r.enabled ? '' : 'opacity-45'}`}>
              <input
                type="checkbox"
                checked={r.enabled}
                disabled={r.kind === 'unmatched'}
                onChange={() => toggle(c.id, creative.id, r.id)}
                className="mt-1 h-3.5 w-3.5 accent-ink"
                aria-label={`Include ${r.label}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">
                  {(c.brief.locked ?? []).some((l) => `${r.label} ${r.text}`.toLowerCase().includes(l.toLowerCase())) && (
                    <span className="mr-1.5 rounded bg-ink px-1 py-px font-mono text-[9px] uppercase text-chalk" title="Locked: never changed by Adapt">
                      Locked
                    </span>
                  )}
                  {r.label}
                  <Footnote n={i + 1} evidenceId={r.evidenceId} />
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                  {r.role} · {SOURCE_LABEL[r.source]}
                  {r.at ? ` · ${r.at}` : ''} · {r.prominence}
                </p>
                {!!r.signals?.length && (
                  <p className="mt-0.5 text-[11.5px] text-ink-2">
                    {r.kind === 'proxy' ? 'Scored via ' : 'Qloo: '}
                    {r.signals.map((s) => s.name).join(', ')}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  r.kind === 'unmatched' ? 'border border-dashed border-line-2 text-ink-3' : 'bg-paper-2 text-ink-2'
                }`}
              >
                {KIND_LABEL[r.kind]}

              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">Untick anything we misread. Every agent re-scores from this list.</p>
      </Panel>
    </div>
  )
}
