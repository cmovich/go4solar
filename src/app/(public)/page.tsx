import { Faq } from '@/components/landing/Faq'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Partners } from '@/components/landing/Partners'
import { PrelaunchBanner } from '@/components/landing/PrelaunchBanner'
import { Proof } from '@/components/landing/Proof'
import { Savings } from '@/components/landing/Savings'

export default function HomePage() {
  return (
    <>
      <PrelaunchBanner />
      <main>
        <Hero />
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
