import { formatNaira } from '@/lib/money'

/**
 * The builder's advisor: facts computed by our engine. The AI (when connected) only rewords
 * these; without it, the facts are shown as they are. Pure.
 */
export function adviceFacts(i: {
  inverterKva: number
  batteryKwh: number
  /** Usable share of the battery (depth of discharge × efficiency). */
  usableShare: number
  panelKw: number
  loadKva: number | null
  monthly: number
  months: number
  systemPrice: number
  blocking: string[]
  warnings: string[]
}): string[] {
  if (i.inverterKva <= 0 && i.batteryKwh <= 0 && i.panelKw <= 0) {
    return ['Choose an inverter, a battery and panels, or tell us your load to get a starting set.']
  }
  const facts: string[] = []
  for (const b of i.blocking) facts.push(`Fix this first: ${b}`)
  const usable = Math.round(i.batteryKwh * i.usableShare * 10) / 10
  if (i.batteryKwh > 0) {
    const kw = i.loadKva ? i.loadKva * 0.8 : i.inverterKva * 0.8
    const hours = kw > 0 ? Math.round((usable / kw) * 10) / 10 : 0
    facts.push(
      i.loadKva
        ? `Your battery stores about ${usable} kWh you can use: about ${hours} hours at your ${i.loadKva} kVA load.`
        : `Your battery stores about ${usable} kWh you can use: about ${hours} hours with the ${i.inverterKva} kVA inverter at full load.`,
    )
  }
  if (i.panelKw > 0) {
    facts.push(
      `Your ${i.panelKw} kW of panels make roughly ${Math.round(i.panelKw * 4)} kWh on a sunny day.`,
    )
  }
  facts.push(...i.warnings)
  if (i.systemPrice > 0) {
    facts.push(
      `You pay ${formatNaira(i.monthly)} a month for ${i.months} months; the total amount payable is ${formatNaira(i.systemPrice)} with 0% interest.`,
    )
  }
  return facts
}

export function ruleBasedAdvice(facts: string[]): string {
  return facts.join(' ')
}
