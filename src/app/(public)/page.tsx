import { Faq } from '@/components/landing/Faq'
import { lateFeeSettings } from '@/lib/agreements/server'
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
import { launchMode } from '@/config/site'

// The hero's example card comes from the live pricing engine, refreshed hourly.
export const revalidate = 3600

export default async function HomePage() {
  const [settings, lateFee] = await Promise.all([getQuoteSettings(), lateFeeSettings()])
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
  }
  return (
    <>
      <PrelaunchBanner />
      <main>
        <Hero example={example} />
        <HowItWorks />
        {/* Illustrative naira figures: hidden while any price is still a SAMPLE price. */}
        {!example.sample && <Savings />}
        <Proof />
        <Partners vendors={launchMode() === 'live'} />
        <Faq lockAfterDays={lateFee.lockAfterDays} />
      </main>
      <Footer />
    </>
  )
}
