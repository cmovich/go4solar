import type { VisionProvider } from './index'
import { extractJson, visionResultSchema, type VisionResult } from './schema'

export const DEFAULT_VISION_MODEL = 'claude-haiku-5-5'

const SYSTEM_PROMPT = `You read appliance rating labels for a Nigerian solar sizing app.
Reply with ONE JSON object only, no prose, no markdown, in exactly this shape:
{"watts": number|null, "method": "label"|"estimate"|"unreadable", "low"?: number, "high"?: number, "appliance"?: string}
Rules:
- If a rating label is readable: method "label"; watts = the rated power in watts. If only volts and amps are printed, watts = volts × amps. If a range is printed, use the higher figure.
- If no label is readable but the appliance is recognisable: method "estimate"; give a typical running-watts range as low and high, and watts = the midpoint. Name the appliance (type, brand, size if visible).
- If you cannot tell what the appliance is: method "unreadable", watts null.
- Running watts only (never kWh or starting/surge watts). Watts must be a whole number from 1 to 10000.`

const USER_PROMPT = 'Read this appliance label or identify the appliance. JSON only.'

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

function mediaTypeOf(blob: Blob): SupportedMediaType {
  const t = blob.type.toLowerCase()
  if (t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg'
  if (t === 'image/png') return 'image/png'
  if (t === 'image/webp') return 'image/webp'
  throw new Error(`Unsupported image type: ${blob.type || 'unknown'}`)
}

/** Calls the Messages API directly (no SDK dependency). The image is never stored. */
export const anthropicVisionProvider: VisionProvider = {
  name: 'anthropic',
  async estimateWatts(image: Blob): Promise<VisionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY')
    const model = process.env.ANTHROPIC_VISION_MODEL || DEFAULT_VISION_MODEL

    const data = Buffer.from(await image.arrayBuffer()).toString('base64')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaTypeOf(image), data } },
              { type: 'text', text: USER_PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      // Never echo the request (it holds the image); the status is enough to debug.
      throw new Error(`Anthropic API error ${res.status}`)
    }

    const body: unknown = await res.json()
    const text = textOf(body)
    const parsed = visionResultSchema.safeParse(extractJson(text))
    // A reply we cannot validate is treated as "could not read", never as a number.
    return parsed.success ? parsed.data : { watts: null, method: 'unreadable' }
  },
}

/** Concatenate the text blocks of a Messages API response. */
function textOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('content' in body)) return ''
  const content = (body as { content: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .map((block: unknown) =>
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      (block as { type: unknown }).type === 'text' &&
      'text' in block &&
      typeof (block as { text: unknown }).text === 'string'
        ? (block as { text: string }).text
        : '',
    )
    .join('\n')
}
