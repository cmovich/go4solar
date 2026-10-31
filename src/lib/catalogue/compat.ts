import { assumedInverter } from '@/lib/sizing/assumed'
import { stringLayout } from '@/lib/sizing/size'
import type { InverterOption, PanelOption } from '@/lib/sizing/types'

/** Part F: what the builder refuses (blocking) or warns about, in plain words. Pure. */

const kw = (w: number) => `${Math.round(w / 100) / 10} kW`

export function compatibility(s: {
  inverter: InverterOption | null
  battery: { voltage: number | null; kwh: number } | null
  panels: { panel: PanelOption; count: number } | null
  /** "I know my load" (kVA). */
  loadKva?: number | null
  /** "Just some items": what the customer already has. */
  existing?: { kva: number | null; batteryV: number | null } | null
  vocSafety?: number
}): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = []
  const warnings: string[] = []
  const inv = s.inverter

  if (inv) {
    if (s.battery?.voltage && s.battery.voltage !== inv.batteryV) {
      blocking.push(
        `This ${s.battery.voltage} V battery does not work with the ${inv.kva} kVA inverter (${inv.batteryV} V). Choose a ${inv.batteryV} V battery.`,
      )
    }
    if (s.panels && s.panels.count > 0) {
      const pvW = s.panels.count * s.panels.panel.watts
      if (pvW > inv.maxPvW) {
        blocking.push(
          `${s.panels.count} panels (${kw(pvW)}) are more than the ${inv.kva} kVA inverter can take (${kw(inv.maxPvW)}). Choose a bigger inverter or fewer panels.`,
        )
      }
      if (!stringLayout(s.panels.count, s.panels.panel, inv, s.vocSafety ?? 1.05)) {
        blocking.push(
          `These panels cannot be wired to suit the ${inv.kva} kVA inverter's voltage range.`,
        )
      }
    }
    if (s.loadKva && inv.kva + 1e-9 < s.loadKva) {
      blocking.push(`Your load (${s.loadKva} kVA) needs at least a ${s.loadKva} kVA inverter.`)
    }
    if (!s.battery && !s.existing?.batteryV) {
      warnings.push('Without a battery the system only works while the sun shines.')
    }
  } else if (s.existing) {
    const e = s.existing
    if (s.battery?.voltage && e.batteryV && s.battery.voltage !== e.batteryV) {
      blocking.push(
        `This ${s.battery.voltage} V battery does not work with your inverter (${e.batteryV} V). Choose a ${e.batteryV} V battery.`,
      )
    }
    if (s.panels && s.panels.count > 0 && e.kva) {
      const pvW = s.panels.count * s.panels.panel.watts
      const limit = assumedInverter(e.kva).maxPvW
      if (pvW > limit) {
        warnings.push(
          `${s.panels.count} panels (${kw(pvW)}) may be more than your ${e.kva} kVA inverter can take (about ${kw(limit)}). We will check it with you.`,
        )
      }
    }
  }
  return { blocking, warnings }
}
