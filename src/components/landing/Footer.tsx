import Image from 'next/image'
import Link from 'next/link'

import { siteConfig } from '@/config/site'
import { normalisePhoneNG } from '@/lib/money'

import { Band, Container } from './Band'

/** wa.me link from NEXT_PUBLIC_WHATSAPP_NUMBER, falling back to the first office line. */
function whatsappHref(): string {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || siteConfig.phones[0]
  let e164: string
  try {
    e164 = normalisePhoneNG(raw)
  } catch {
    e164 = `+${raw.replace(/\D/g, '')}`
  }
  return `https://wa.me/${e164.replace('+', '')}`
}

function telHref(phone: string): string {
  try {
    return `tel:${normalisePhoneNG(phone)}`
  } catch {
    return `tel:${phone}`
  }
}

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <Band className="pt-16 pb-10">
      <Container>
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <span className="inline-flex rounded-md bg-white px-3 py-1.5">
              <Image
                src="/brand/go4solar-logo.png"
                alt={siteConfig.name}
                width={150}
                height={48}
                className="h-9 w-auto"
              />
            </span>
            <p className="mt-4 text-sm text-white/75">
              Solar on monthly payments for Nigerian homes and small businesses. Direct from the
              manufacturers, zero interest, one fixed price.
            </p>
          </div>

          <address className="text-sm text-white/85 not-italic">
            <p className="font-semibold text-white">{siteConfig.legalName}</p>
            <p className="mt-2">{siteConfig.address}</p>
            <p className="mt-2">
              <a href={`mailto:${siteConfig.email}`} className="hover:text-brand-gold">
                {siteConfig.email}
              </a>
            </p>
            <ul className="mt-2 space-y-1">
              {siteConfig.phones.map((p) => (
                <li key={p}>
                  <a href={telHref(p)} className="hover:text-brand-gold">
                    {p}
                  </a>
                </li>
              ))}
            </ul>
          </address>

          <div className="flex flex-col items-start gap-4 md:items-end">
            <a
              href={whatsappHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-visible:ring-brand-gold inline-flex h-12 items-center gap-2 rounded-lg bg-[#25D366] px-5 text-base font-semibold text-white transition-colors hover:bg-[#1ebe5b] focus-visible:ring-2 focus-visible:outline-none"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4 5.3 5.3 0 0 0 3.2.7 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.2-.2-.4-.3Z" />
              </svg>
              Chat on WhatsApp
            </a>
            <nav className="flex gap-5 text-sm text-white/85">
              <Link href="/privacy" prefetch={false} className="hover:text-brand-gold">
                Privacy
              </Link>
              <Link href="/terms" prefetch={false} className="hover:text-brand-gold">
                Terms
              </Link>
            </nav>
          </div>
        </div>

        <p className="mt-12 border-t border-white/10 pt-6 text-xs text-white/60">
          © {year} {siteConfig.legalName}. Serving Abuja (FCT), Kaduna and Lagos.
        </p>
      </Container>
    </Band>
  )
}
