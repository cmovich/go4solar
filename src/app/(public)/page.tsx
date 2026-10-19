import { Faq } from '@/components/landing/Faq'
import { lateFeeSettings } from '@/lib/agreements/server'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { PartnerLogos } from '@/components/landing/PartnerLogos'
import { Testimonials } from '@/components/landing/Testimonials'
import { activePartners, publishedTestimonials } from '@/lib/content/server'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Partners } from '@/components/landing/Partners'
import { Proof } from '@/components/landing/Proof'
import { Savings } from '@/components/landing/Savings'
import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { offeredTenures } from '@/lib/pricing/tenures'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { launchMode } from '@/config/site'

// The hero's example card comes from the live pricing engine, refreshed hourly.
export const revalidate = 3600

export default async function HomePage() {
  const [settings, lateFee, testimonials, partners] = await Promise.all([
    getQuoteSettings(),
    lateFeeSettings(),
    publishedTestimonials(),
    activePartners(),
  ])
  const tenures = offeredTenures(settings.pricing.pricingRateByTenure)
  const comfortEstimate = buildEstimate(computeLoadTotals(sampleHomeItems), 'Lagos', 0.2, settings)
  const comfort = comfortEstimate.plans.comfort
  const example = {
    rows: [
      { label: 'Inverter', value: `${comfort.size.inverterKva} kVA` },
      { label: 'Battery', value: `${comfort.size.batteryKwh} kWh` },
      { label: 'Panels', value: `${comfort.size.panelCount} × ${settings.sizing.panelWatts} W` },
      {
        label: 'Backup',
        value: `about ${Math.round(comfort.size.backupHoursFullLoad)} hours at full load`,
      },
    ],
    monthly: comfort.quote.monthly,
    months: comfort.quote.snapshot.tenureMonths,
    total: comfort.quote.systemPrice,
    // Installation costs count too: any SAMPLE price used hides the amounts.
    sample: comfortEstimate.sample,
    maxMonths: Math.max(...tenures),
  }
  return (
    <>
      <main>
        <Hero example={example} />
        <HowItWorks />
        {/* Illustrative naira figures: hidden while any price is still a SAMPLE price. */}
        {!example.sample && <Savings />}
        <Proof />
        <Testimonials items={testimonials} />
        <Partners vendors={launchMode() === 'live'} />
        <PartnerLogos partners={partners} />
        <Faq lockAfterDays={lateFee.lockAfterDays} tenures={tenures} />
      </main>
      <Footer />
    </>
  )
}
