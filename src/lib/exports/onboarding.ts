import { whatsappHref } from '@/lib/whatsapp'

/**
 * Funder onboarding links (pure). A funder may add a link per person (or one for the whole batch)
 * where the customer completes their details and verification on the funder's own platform. Only
 * https links on the funder's own domains (Admin → Funders), subdomains included.
 */
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

/** "tradelenda.com, app.tradelenda.com" → the clean list (and anything that is not a domain). */
export function parseDomains(text: string): { domains: string[]; bad: string[] } {
  const domains: string[] = []
  const bad: string[] = []
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const d = raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[/?#].*$/, '')
    if (DOMAIN.test(d)) {
      if (!domains.includes(d)) domains.push(d)
    } else bad.push(raw)
  }
  return { domains, bad }
}

/** Why this link cannot be used for this funder (null: fine). */
export function onboardingLinkProblem(url: string, domains: string[]): string | null {
  if (domains.length === 0)
    return 'This funder has no onboarding domains yet (Admin → Funders): no link can be added.'
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return 'Paste the full link, starting with https://'
  }
  if (u.protocol !== 'https:') return 'The link must start with https://'
  if (u.username || u.password) return 'Links with a user name or password are not allowed.'
  if (url.length > 500) return 'The link is too long.'
  const host = u.hostname.toLowerCase()
  const ok = domains.some((d) => host === d || host.endsWith(`.${d}`))
  return ok ? null : `The link must be on ${domains.join(' or ')}.`
}

/** "Send by WhatsApp": a wa.me link to the customer with a pre-filled message. */
export function onboardingWhatsappHref(i: {
  phone: string
  firstName: string | null
  funderName: string
  url: string
}): string {
  const hello = i.firstName ? `Hello ${i.firstName}` : 'Hello'
  return whatsappHref(
    i.phone,
    `${hello}, this is Go4Solar. To continue your solar payment plan, please complete your details and verification with ${i.funderName} here: ${i.url}`,
  )
}
