import { Container, SectionHeading } from './Band'

const steps = [
  {
    title: 'Calculate your load',
    text: 'Tick the appliances you want to power. We work out the watts and the hours for you.',
  },
  {
    title: 'Choose a plan',
    text: 'Pick Essential, Comfort or 24-Hour Independence. Set your deposit from 20% and see the monthly amount.',
  },
  {
    title: 'Get verified',
    text: 'Confirm who you are with your NIN and a quick face check, then add a guarantor.',
  },
  {
    title: 'Get installed',
    text: 'A verified installer fits genuine equipment at your home or shop. You start paying monthly.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From appliances to installed solar in four steps"
          lead="No sign-up until you choose a plan. The calculator is free and takes about three minutes."
        />
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-brand-mist relative rounded-xl p-6">
              <span className="bg-brand-green inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white">
                {i + 1}
              </span>
              <h3 className="text-brand-dark mt-4 text-xl font-semibold">{s.title}</h3>
              <p className="text-muted-foreground mt-2 text-base">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}
