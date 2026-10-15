export type TextPart = { type: 'text' | 'link'; value: string }

const URL_RE = /https?:\/\/[^\s<>"']+/g

/**
 * Splits a message into text and link parts so every URL can be shown as a clickable link.
 * Trailing punctuation (".", ",", ")") is kept out of the link.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '')
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'link', value: url })
    last = m.index + url.length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts.length ? parts : [{ type: 'text', value: text }]
}
