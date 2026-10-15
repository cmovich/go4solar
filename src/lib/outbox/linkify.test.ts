import { describe, expect, it } from 'vitest'

import { linkify } from './linkify'

const link = 'https://go4solar-git-phase-1-moses-semakos-projects.vercel.app/guarantee/abc123'

// Fix-up 1 #4/#5: links in outbox messages were plain text, so they could not be opened.
describe('linkify (outbox messages)', () => {
  it('turns every URL into a link part, keeping the text around it', () => {
    expect(linkify(`Please respond within 72 hours: ${link}. Thank you`)).toEqual([
      { type: 'text', value: 'Please respond within 72 hours: ' },
      { type: 'link', value: link },
      { type: 'text', value: '. Thank you' },
    ])
  })

  it('handles several links and plain http', () => {
    expect(linkify('a http://localhost:3000/x b https://example.org/y')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'link', value: 'http://localhost:3000/x' },
      { type: 'text', value: ' b ' },
      { type: 'link', value: 'https://example.org/y' },
    ])
  })

  it('handles text without links', () => {
    expect(linkify('Your code is 123456')).toEqual([{ type: 'text', value: 'Your code is 123456' }])
  })
})
