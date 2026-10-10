import { Fragment } from 'react'

function bold(line: string) {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    )
}

/** The same small Markdown subset as the PDF: # / ## headings, "- " bullets, **bold**. */
export function AgreementText({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let bullets: string[] = []
  const flush = (key: number) => {
    if (!bullets.length) return
    out.push(
      <ul key={`ul-${key}`} className="mb-2 list-disc space-y-1 pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{bold(b)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
      return
    }
    flush(i)
    if (!line.trim()) return
    if (line.startsWith('# '))
      out.push(
        <h2 key={i} className="text-brand-dark mb-2 text-lg font-bold">
          {line.slice(2)}
        </h2>,
      )
    else if (line.startsWith('## '))
      out.push(
        <h3 key={i} className="text-brand-green mt-4 mb-1 font-bold">
          {line.slice(3)}
        </h3>,
      )
    else if (line.includes('DRAFT — lawyer review required'))
      out.push(
        <p key={i} className="mb-2 font-bold text-red-700">
          {line.replace(/\*/g, '')}
        </p>,
      )
    else
      out.push(
        <p key={i} className="mb-2">
          {bold(line)}
        </p>,
      )
  })
  flush(-1)
  return <div>{out}</div>
}
