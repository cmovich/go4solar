import { z } from 'zod'

import { p70, type LookupUsage } from '@/lib/vision/spend'

import type { LookupOutcome, PhotoKind, VisionProvider } from './index'
import { extractJson, visionResultSchema, type VisionResult } from './schema'

/** Override with ANTHROPIC_VISION_MODEL. */
export const DEFAULT_VISION_MODEL = 'claude-haiku-4-5-20251001'

const SHAPE = `{"watts": number|null, "method": "label"|"estimate"|"unreadable", "low"?: number, "high"?: number, "appliance"?: string, "brand"?: string, "model"?: string, "brandModelVisible": boolean}`

const LABEL_PROMPT = `You read appliance rating labels for a Nigerian solar sizing app.
Reply with ONE JSON object only, no prose, no markdown, in exactly this shape:
${SHAPE}
Rules:
- If the rating label is readable: method "label"; watts = the rated power in watts. If only volts and amps are printed, watts = volts × amps. If a range is printed, use the higher figure.
- If no label is readable: method "unreadable", watts null.
- Fill appliance, brand and model only if printed. brandModelVisible = true only when both brand and model are clearly printed.
- Running watts only (never kWh or starting/surge watts). Watts must be a whole number from 1 to 10000.`

const ITEM_PROMPT = `You estimate appliance power from a photo of the appliance for a Nigerian solar sizing app.
Reply with ONE JSON object only, no prose, no markdown, in exactly this shape:
${SHAPE}
Rules:
- If the appliance is recognisable: method "estimate"; low and high = the typical running-watts range for this kind and size of appliance; watts = null (the app works out the figure); name the appliance (type and size).
- brand and model: only if they are clearly readable on the photo. brandModelVisible = true only when you can read BOTH with confidence; otherwise false.
- If you cannot tell what the appliance is: method "unreadable", watts null.
- Running watts only (never kWh or starting watts). Whole numbers from 1 to 10000.`

const WEB_PROMPT = (brand: string, model: string, appliance: string) =>
  `Find the manufacturer's rated running power in watts for this appliance: ${brand} ${model} (${appliance}). Use the maker's specifications or a reputable retailer listing for this exact model. Reply with ONE JSON object only: {"watts": number|null}. Use null if you cannot find this exact model.`

/** What the model returns before the app finalises it. */
const rawSchema = z.object({
  watts: z.number().nullable().optional(),
  method: z.enum(['label', 'estimate', 'unreadable']),
  low: z.number().optional(),
  high: z.number().optional(),
  appliance: z.string().max(80).optional(),
  brand: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  brandModelVisible: z.boolean().optional(),
})

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

function mediaTypeOf(blob: Blob): SupportedMediaType {
  const t = blob.type.toLowerCase()
  if (t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg'
  if (t === 'image/png') return 'image/png'
  if (t === 'image/webp') return 'image/webp'
  throw new Error(`Unsupported image type: ${blob.type || 'unknown'}`)
}

const UNREADABLE: VisionResult = { watts: null, method: 'unreadable' }

async function call(body: Record<string, unknown>): Promise<{ text: string; usage: LookupUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_VISION_MODEL || DEFAULT_VISION_MODEL,
      ...body,
    }),
    signal: AbortSignal.timeout(45_000),
  })
  // Never echo the request (it holds the photo); the status is enough to debug.
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`)
  const json: unknown = await res.json()
  return { text: textOf(json), usage: usageOf(json) }
}

const add = (a: LookupUsage, b: LookupUsage): LookupUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  webSearches: a.webSearches + b.webSearches,
})

/** Turn the model's reading into what the calculator uses (validated; estimates at p70). */
function finalise(raw: z.infer<typeof rawSchema>, kind: PhotoKind): VisionResult {
  const extra = {
    ...(raw.appliance ? { appliance: raw.appliance } : {}),
    ...(raw.brand ? { brand: raw.brand } : {}),
    ...(raw.model ? { model: raw.model } : {}),
  }
  let candidate: unknown = UNREADABLE
  if (raw.method === 'label' && kind === 'label' && raw.watts) {
    candidate = { watts: raw.watts, method: 'label', ...extra }
  } else if (raw.method === 'estimate' && raw.low !== undefined && raw.high !== undefined) {
    const low = Math.min(raw.low, raw.high)
    const high = Math.max(raw.low, raw.high)
    candidate = { watts: p70(low, high), method: 'estimate', low, high, ...extra }
  }
  const p = visionResultSchema.safeParse(candidate)
  return p.success ? p.data : UNREADABLE
}

/**
 * Calls the Messages API directly (no SDK dependency). The photo is sent once and never stored.
 * A web search runs only for an appliance photo whose brand and model are clearly visible.
 */
export const anthropicVisionProvider: VisionProvider = {
  name: 'anthropic',
  async lookup(image: Blob, kind: PhotoKind): Promise<LookupOutcome> {
    const data = Buffer.from(await image.arrayBuffer()).toString('base64')
    const first = await call({
      max_tokens: 300,
      system: kind === 'label' ? LABEL_PROMPT : ITEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaTypeOf(image), data } },
            { type: 'text', text: 'JSON only.' },
          ],
        },
      ],
    })
    const raw = rawSchema.safeParse(extractJson(first.text))
    if (!raw.success) return { result: UNREADABLE, usage: first.usage }
    let result = finalise(raw.data, kind)
    let usage = first.usage

    const r = raw.data
    if (kind === 'item' && r.method === 'estimate' && r.brandModelVisible && r.brand && r.model) {
      try {
        const web = await call({
          max_tokens: 400,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
          messages: [
            { role: 'user', content: WEB_PROMPT(r.brand, r.model, r.appliance ?? 'appliance') },
          ],
        })
        usage = add(usage, web.usage)
        const found = z.object({ watts: z.number().nullable() }).safeParse(extractJson(web.text))
        const watts = found.success ? found.data.watts : null
        const checked = visionResultSchema.safeParse({
          watts,
          method: 'web',
          ...(r.appliance ? { appliance: r.appliance } : {}),
          brand: r.brand,
          model: r.model,
        })
        if (watts && checked.success) result = checked.data
      } catch (err) {
        // The estimate stands; the web lookup is a bonus.
        console.error('[vision] web lookup failed:', err instanceof Error ? err.message : err)
      }
    }
    return { result, usage }
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
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
        ? (block as { text: string }).text
        : '',
    )
    .join('\n')
}

/** Token and web-search counts of a Messages API response (0 when missing). */
function usageOf(body: unknown): LookupUsage {
  const u = (body as { usage?: Record<string, unknown> } | null)?.usage ?? {}
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const tool = (u.server_tool_use ?? {}) as Record<string, unknown>
  return {
    inputTokens: n(u.input_tokens),
    outputTokens: n(u.output_tokens),
    webSearches: n(tool.web_search_requests),
  }
}
