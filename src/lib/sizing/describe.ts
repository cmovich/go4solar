import type { Plan, SystemSize } from './types'

const h = (n: number) => `${Math.round(n * 10) / 10} h`
const allNight = (n: number, night: number) => (n >= night ? ' (all night)' : '')

/**
 * The backup lines for a plan card, in plain words (Part B): backup with the plan's items on,
 * at the customer's typical night use, with grid and on a day the grid does not come, any
 * battery shortfall, the rainy-season note and why the inverter is bigger than the load needs.
 * Estimates stored before Part B only have the first two figures.
 */
export function backupLines(size: SystemSize, plan: Plan, nightHours = 12): string[] {
  const items =
    plan === 'essential' && size.workings?.items !== 'all' && size.version === 2
      ? 'your essential items'
      : 'everything'
  const out = [`Backup with ${items} on ≈ ${h(size.backupHoursFullLoad)}`]
  if (size.realisticBackupHours !== null && size.realisticBackupHours !== undefined) {
    out.push(
      `At your typical night use ≈ ${h(size.realisticBackupHours)}${allNight(size.realisticBackupHours, nightHours)}`,
    )
  }
  if (size.backupWithGridHours !== null && size.backupWithGridHours !== undefined) {
    out.push(
      `With grid as you described ≈ ${h(size.backupWithGridHours)}${allNight(size.backupWithGridHours, nightHours)}`,
    )
  }
  if (size.noGridDayBackupHours !== null && size.noGridDayBackupHours !== undefined) {
    out.push(`On days with no grid, backup ≈ ${h(size.noGridDayBackupHours)}`)
  }
  if (size.shortfall) {
    out.push(`Battery rounded down: about ${size.shortfall.hours} h short of the plan`)
  }
  if (size.rainyNote) out.push('In the rainy season, expect less backup on cloudy days.')
  if (size.inverterReason) out.push(size.inverterReason)
  return out
}
