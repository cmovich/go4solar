// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The real canvas needs a browser; this stand-in "draws" a signature on click.
vi.mock('./SignatureCanvas', () => ({
  SignatureCanvas: ({ onChange }: { onChange: (png: string | null) => void }) => (
    <button type="button" onClick={() => onChange('data:image/png;base64,' + 'A'.repeat(80))}>
      draw
    </button>
  ),
}))

const { AgreementSigner, reachedEnd } = await import('./AgreementSigner')

const TICKS = [
  { id: 'agreement', label: 'I agree' },
  { id: 'lock', label: 'I understand the lock' },
]

function setup() {
  const sendCode = vi.fn(async () => ({ ok: true as const }))
  const sign = vi.fn(async () => ({ ok: true as const }))
  render(
    <AgreementSigner
      text={'# Agreement\n\nLong text'}
      ticks={TICKS}
      defaultName="Ada Obi"
      phoneHint="+234•••••4567"
      sendCode={sendCode}
      sign={sign}
      onSigned={() => {}}
    />,
  )
  // Fill in everything except reading to the end.
  for (const t of TICKS) fireEvent.click(screen.getByLabelText(t.label))
  fireEvent.click(screen.getByText('draw'))
  return { sendCode, sign }
}

/** Give the scroll box real dimensions (jsdom has no layout) and scroll it. */
function scrollBox(scrollTop: number) {
  const box = screen.getByTestId('agreement-scroll')
  Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 400 })
  Object.defineProperty(box, 'scrollTop', { configurable: true, writable: true, value: scrollTop })
  fireEvent.scroll(box)
}

const disabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled

afterEach(cleanup)

describe('AgreementSigner', () => {
  it('blocks signing until the agreement is scrolled to the end', () => {
    setup()
    const send = screen.getByRole('button', { name: /send my signing code/i })
    expect(disabled(send)).toBe(true)
    expect(screen.getByText('Read the agreement to the end to sign.')).toBeTruthy()

    scrollBox(500) // part way down: still blocked
    expect(disabled(send)).toBe(true)

    scrollBox(1600) // the bottom
    expect(disabled(send)).toBe(false)
  })

  it('blocks signing until every box is ticked, even after scrolling', () => {
    setup()
    fireEvent.click(screen.getByLabelText('I understand the lock')) // untick one
    scrollBox(1600)
    expect(disabled(screen.getByRole('button', { name: /send my signing code/i }))).toBe(true)
    expect(screen.getByText('Tick every box above.')).toBeTruthy()
  })

  it('sends scrolledToEnd, the ticks, the signature and the code when signing', async () => {
    const { sendCode, sign } = setup()
    scrollBox(1600)
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /send my signing code/i })),
    )
    expect(sendCode).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByLabelText(/enter the 6-digit code/i), {
      target: { value: '123456' },
    })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /sign the agreement/i })),
    )
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        typedName: 'Ada Obi',
        scrolledToEnd: true,
        ticks: { agreement: true, lock: true },
        code: '123456',
      }),
    )
  })
})

describe('reachedEnd', () => {
  it('needs the bottom of the box (with a small allowance)', () => {
    expect(reachedEnd({ scrollTop: 0, clientHeight: 400, scrollHeight: 2000 })).toBe(false)
    expect(reachedEnd({ scrollTop: 1590, clientHeight: 400, scrollHeight: 2000 })).toBe(true)
    expect(reachedEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false)
  })
})
