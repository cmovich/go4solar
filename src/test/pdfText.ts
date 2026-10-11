import { inflateSync } from 'node:zlib'

/**
 * Test helper: the text on each page of a PDF made by @react-pdf/renderer. Handles its output
 * (FlateDecode streams, Type0 Identity-H fonts with ToUnicode maps, standard fonts) — not a
 * general PDF parser.
 */
export function pdfPageTexts(pdf: Buffer): string[] {
  const src = pdf.toString('latin1')
  const objects = new Map<number, { dict: string; stream: string | null }>()
  const objRe = /(\d+) 0 obj\s*([\s\S]*?)endobj/g
  for (let m = objRe.exec(src); m; m = objRe.exec(src)) {
    const body = m[2]!
    const s = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body)
    let stream: string | null = null
    if (s) {
      const raw = Buffer.from(s[1]!, 'latin1')
      stream = /\/FlateDecode/.test(body) ? inflateSync(raw).toString('latin1') : s[1]!
    }
    objects.set(Number(m[1]), { dict: s ? body.slice(0, s.index) : body, stream })
  }
  const ref = (dict: string, key: string) => {
    const r = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dict)
    return r ? Number(r[1]) : null
  }

  const pagesRoot = [...objects.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.dict))
  const kids = /\/Kids\s*\[([^\]]*)\]/.exec(pagesRoot?.dict ?? '')?.[1] ?? ''
  const pageIds = [...kids.matchAll(/(\d+) 0 R/g)].map((k) => Number(k[1]))

  return pageIds.map((id) => {
    const page = objects.get(id)!.dict
    const resId = ref(page, 'Resources')
    const resources = resId ? objects.get(resId)!.dict : page
    const fontDict = /\/Font\s*<<([^>]*)>>/.exec(resources)?.[1] ?? ''
    const fonts = new Map<string, Map<string, string> | null>()
    for (const f of fontDict.matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const fontObj = objects.get(Number(f[2]))!
      const tu = ref(fontObj.dict, 'ToUnicode')
      fonts.set(f[1]!, tu ? parseCMap(objects.get(tu)!.stream ?? '') : null)
    }
    const contentId = ref(page, 'Contents')!
    return decodeContent(objects.get(contentId)!.stream ?? '', fonts)
  })
}

function hexToString(hex: string): string {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4)
    out += String.fromCodePoint(parseInt(hex.slice(i, i + 4), 16))
  return out
}

function parseCMap(cmap: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const e of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(e[1]!.toLowerCase(), hexToString(e[2]!))
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const e of block[1]!.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g,
    )) {
      const lo = parseInt(e[1]!, 16)
      const hi = parseInt(e[2]!, 16)
      const width = e[1]!.length
      const dst = e[3]!
      for (let c = lo; c <= hi; c++) {
        const key = c.toString(16).padStart(width, '0')
        if (dst.startsWith('[')) {
          const items = [...dst.matchAll(/<([0-9a-fA-F]+)>/g)]
          const item = items[c - lo]
          if (item) map.set(key, hexToString(item[1]!))
        } else {
          const base = dst.slice(1, -1)
          map.set(key, String.fromCodePoint(parseInt(base, 16) + (c - lo)))
        }
      }
    }
  }
  return map
}

function decodeContent(content: string, fonts: Map<string, Map<string, string> | null>): string {
  const parts: string[] = []
  let cmap: Map<string, string> | null = null
  const opRe = /\/(\w+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj|ET/g
  for (let m = opRe.exec(content); m; m = opRe.exec(content)) {
    if (m[1]) cmap = fonts.get(m[1]) ?? null
    else if (m[2] !== undefined)
      parts.push(
        decodeHexRuns(
          [...m[2].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]!),
          cmap,
        ),
      )
    else if (m[3] !== undefined) parts.push(decodeHexRuns([m[3]], cmap))
    else parts.push(' ')
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function decodeHexRuns(runs: string[], cmap: Map<string, string> | null): string {
  return runs
    .map((hex) => {
      if (!cmap) return Buffer.from(hex, 'hex').toString('latin1')
      let out = ''
      for (let i = 0; i + 4 <= hex.length; i += 4)
        out += cmap.get(hex.slice(i, i + 4).toLowerCase()) ?? ''
      return out
    })
    .join('')
}
