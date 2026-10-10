import { Faq } from '@/components/landing/Faq'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Partners } from '@/components/landing/Partners'
import { PrelaunchBanner } from '@/components/landing/PrelaunchBanner'
import { Proof } from '@/components/landing/Proof'
import { Savings } from '@/components/landing/Savings'
import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'

// The hero's example card comes from the live pricing engine, refreshed hourly.
export const revalidate = 3600

export default async function HomePage() {
  const settings = await getQuoteSettings()
  const comfort = buildEstimate(computeLoadTotals(sampleHomeItems), 'Lagos', 0.2, settings).plans
    .comfort
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
    sample: settings.priceList.sample || settings.pricing.sample,
  }
  return (
    <>
      <PrelaunchBanner />
      <main>
        <Hero example={example} />
        <HowItWorks />
        <Savings />
        <Proof />
        <Partners />
        <Faq />
      </main>
      <Footer />
    </>
  )
}
