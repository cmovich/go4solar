import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { anthropicVisionProvider } from './anthropic'

const reply = (json: unknown, usage = { input_tokens: 1500, output_tokens: 60 }) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }], usage }), {
    status: 200,
  })

const image = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
let fetchMock: ReturnType<typeof vi.fn>
const bodies = () =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string))

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('Anthropic photo lookup (the API call is mocked)', () => {
  it('a label photo: exact watts from the label, one call, no web search', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        watts: 150,
        method: 'label',
        appliance: 'Fridge',
        brand: 'LG',
        model: 'GN-B222',
        brandModelVisible: true,
      }),
    )
    const r = await anthropicVisionProvider.lookup(image(), 'label')
    expect(r.result).toMatchObject({ watts: 150, method: 'label', appliance: 'Fridge' })
    expect(r.usage).toEqual({ inputTokens: 1500, outputTokens: 60, webSearches: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodies()[0].tools).toBeUndefined()
  })

  it('an appliance photo with no clear brand/model: a range, sized at the 70th percentile, no web', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        method: 'estimate',
        low: 100,
        high: 200,
        appliance: 'Standing fan',
        brandModelVisible: false,
      }),
    )
    const r = await anthropicVisionProvider.lookup(image(), 'item')
    expect(r.result).toEqual({
      watts: 170,
      method: 'estimate',
      low: 100,
      high: 200,
      appliance: 'Standing fan',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('brand and model clearly visible: a web lookup (text only, no photo) gives the rated watts', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({
          method: 'estimate',
          low: 1000,
          high: 1500,
          appliance: 'Microwave',
          brand: 'LG',
          model: 'MS2042D',
          brandModelVisible: true,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              { type: 'server_tool_use', name: 'web_search' },
              { type: 'text', text: '{"watts": 1150}' },
            ],
            usage: {
              input_tokens: 3000,
              output_tokens: 80,
              server_tool_use: { web_search_requests: 1 },
            },
          }),
          { status: 200 },
        ),
      )
    const r = await anthropicVisionProvider.lookup(image(), 'item')
    expect(r.result).toMatchObject({ watts: 1150, method: 'web', brand: 'LG', model: 'MS2042D' })
    expect(r.usage).toEqual({ inputTokens: 4500, outputTokens: 140, webSearches: 1 })
    const web = bodies()[1]
    expect(web.tools[0]).toMatchObject({ type: 'web_search_20250305', name: 'web_search' })
    expect(JSON.stringify(web.messages)).not.toContain('base64') // the photo is not sent again
  })

  it('the web lookup finds nothing: falls back to the estimated range (70th percentile)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({
          method: 'estimate',
          low: 1000,
          high: 1500,
          appliance: 'Microwave',
          brand: 'LG',
          model: 'X1',
          brandModelVisible: true,
        }),
      )
      .mockResolvedValueOnce(reply({ watts: null }))
    const r = await anthropicVisionProvider.lookup(image(), 'item')
    expect(r.result).toMatchObject({ watts: 1350, method: 'estimate', low: 1000, high: 1500 })
  })

  it('a reply that is not valid JSON is "unreadable", never a number', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'sorry' }] }), { status: 200 }),
    )
    const r = await anthropicVisionProvider.lookup(image(), 'label')
    expect(r.result).toEqual({ watts: null, method: 'unreadable' })
  })

  it('an API error is thrown without echoing the request (it holds the photo)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 529 }))
    await expect(anthropicVisionProvider.lookup(image(), 'label')).rejects.toThrow(
      'Anthropic API error 529',
    )
  })
})
