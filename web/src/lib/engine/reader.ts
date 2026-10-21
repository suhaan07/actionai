import type { City, Creative, Reference, Swap } from '../types'

/** The adapted creative, rebuilt from accepted swaps only. Scores come from Qloo via each swap. */
export function buildAdapted(source: Creative, swaps: Swap[], city: City, id: string): Creative {
  let text = source.text
  const refs = source.refs.map((r): Reference => {
    const sw = swaps.find((s) => s.refId === r.id && s.status === 'accepted')
    if (!sw) return r
    text = text.replace(r.text, sw.to)
    return {
      ...r,
      id: `${r.id}~${city}`,
      text: sw.to,
      label: sw.to,
      kind: 'proxy',
      scores: { ...sw.toScores },
      signals: sw.toSignals,
      evidenceId: sw.evidenceId,
    }
  })
  return {
    id,
    name: `${source.name} · ${city} version`,
    format: source.format,
    text,
    refs,
    parentId: source.id,
    adaptedFor: city,
    isPlaceholder: source.isPlaceholder,
  }
}

/** Heuristic for "the message itself is a script", used when the language model is unreachable. */
export const looksLikeScript = (text: string) => text.length > 160 && /[.!?]/.test(text) && (text.match(/[.!?]/g)?.length ?? 0) >= 2
