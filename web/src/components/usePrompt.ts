import { useEffect, useRef, useState } from 'react'
import { AGENT_ORDER } from '../lib/agents'
import { fileStore } from '../lib/api'
import { useTour, type Surface } from '../lib/tour'
import { uid } from '../lib/uid'
import type { AgentId, Attachment, CreativeFormat } from '../lib/types'

const formatOf = (name: string): CreativeFormat => {
  const n = name.toLowerCase()
  if (/\.(mp4|mov|webm|m4v|avi)$/.test(n)) return n.includes('reel') || n.includes('story') ? 'reel' : 'video'
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(n)) return 'image'
  return 'script'
}

/** Shared state for both prompt surfaces: text, attachments, pinned agent, @-mentions. */
export function usePrompt(surface?: Surface, initialPinned?: AgentId) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pinned, setPinned] = useState<AgentId | undefined>(initialPinned)
  const draft = useTour((s) => s.draft)
  useEffect(() => {
    if (draft && surface && draft.surface === surface) {
      setText(draft.text)
      setPinned(draft.pinned)
    }
  }, [draft, surface])
  const fileRef = useRef<HTMLInputElement>(null)

  const mention = text.match(/(?:^|\s)@(\w*)$/)
  const mentionOptions = mention ? AGENT_ORDER.filter((a) => a.startsWith(mention[1].toLowerCase())) : []

  const pickMention = (a: AgentId) => {
    setPinned(a)
    setText((t) => t.replace(/(?:^|\s)@\w*$/, (m) => (m.startsWith(' ') ? ' ' : '')))
  }

  const onFiles = (files: FileList | null) => {
    if (!files) return
    const next = Array.from(files).map((f) => {
      const id = uid('att')
      fileStore.set(id, f)
      return { id, name: f.name, format: formatOf(f.name), size: f.size }
    })
    setAttachments((a) => [...a, ...next].slice(0, 3))
  }

  const reset = () => {
    setText('')
    setAttachments([])
  }

  const canSend = text.trim().length > 0 || attachments.length > 0

  return { text, setText, attachments, setAttachments, pinned, setPinned, fileRef, onFiles, mentionOptions, pickMention, reset, canSend }
}
