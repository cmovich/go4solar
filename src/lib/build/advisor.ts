import 'server-only'

import { ruleBasedAdvice } from './advice'

const DEFAULT_ADVISOR_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Plain-English advice from the engine's facts. With ADVISOR_PROVIDER=anthropic and an API key,
 * Claude rewords the facts (never adds numbers); otherwise, or if the call fails, the facts as
 * they are. Never throws.
 */
export async function adviseFromFacts(facts: string[]): Promise<{ text: string; ai: boolean }> {
  const plain = { text: ruleBasedAdvice(facts), ai: false }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (process.env.ADVISOR_PROVIDER !== 'anthropic' || !apiKey || facts.length === 0) return plain
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_ADVISOR_MODEL || DEFAULT_ADVISOR_MODEL,
        max_tokens: 300,
        system:
          'You are a friendly solar advisor for Go4Solar customers in Nigeria. Explain the facts you are given in plain, warm English in at most 90 words. Use only the numbers in the facts; never add, change or estimate any number, price or promise. Never say "loan" or "interest" except "0% interest" exactly as given. No headings or lists.',
        messages: [{ role: 'user', content: facts.map((f) => `- ${f}`).join('\n') }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return plain
    const body = (await res.json()) as { content?: { type: string; text?: string }[] }
    const text = body.content?.find((c) => c.type === 'text')?.text?.trim()
    return text ? { text, ai: true } : plain
  } catch {
    return plain
  }
}
