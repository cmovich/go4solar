import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import { Container, SectionHeading } from './Band'

const faqs = (lockAfterDays: number) => [
  {
    q: 'How much deposit do I need?',
    a: 'At least 20% of the system price. You can pay more if you like: a bigger deposit lowers both your monthly payment and your total price.',
  },
  {
    q: 'How long can I spread the payments?',
    a: 'Choose 3, 6, 9 or 12 months. Shorter plans cost less in total; longer plans give a smaller monthly amount. Your quote shows every option side by side.',
  },
  {
    q: 'What happens if I miss a payment?',
    a: `We send reminders first. A late payment attracts a fee of 0.75% of the overdue amount per day, and this is written into your agreement. If a payment is ${lockAfterDays} days overdue the system can be locked remotely until the balance is settled; paying in the app unlocks it automatically.`,
  },
  {
    q: 'Is the equipment under warranty?',
    a: 'Yes. We import directly from the manufacturers, so every panel, battery and inverter comes with the maker’s genuine warranty, and we handle warranty claims for you.',
  },
  {
    q: 'Who installs the system?',
    a: 'A verified Go4Solar partner installer in your state. Installers are checked for identity, experience and references, and they upload photos and serial numbers when your job is done.',
  },
  {
    q: 'Is it really 0% interest?',
    a: 'Yes. You pay one fixed price for your system, shown in full before you sign, split into a deposit and equal monthly payments. There is no interest and no hidden finance charge; the total amount payable is always on your quote.',
  },
]

export function Faq({ lockAfterDays }: { lockAfterDays: number }) {
  return (
    <section id="faq" className="py-20 sm:py-24">
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions people ask before they start" />
        <Accordion type="single" collapsible className="mt-10">
          {faqs(lockAfterDays).map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`}>
              <AccordionTrigger className="text-brand-dark text-left text-base font-semibold sm:text-lg">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  )
}
