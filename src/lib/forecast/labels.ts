import type { ScenarioInputs } from './scenario'

export type InputKind = 'int' | 'number' | 'naira' | 'percent'

/** Every scenario input with its label and how it is shown (UI and exports share this). */
export const INPUT_FIELDS: { path: string; label: string; kind: InputKind }[] = [
  { path: 'years', label: 'Horizon (years)', kind: 'int' },
  { path: 'newPerMonthYear1', label: 'New customers per month, year 1', kind: 'number' },
  { path: 'growthLow', label: 'Growth per year: Low', kind: 'percent' },
  { path: 'growthBase', label: 'Growth per year: Base', kind: 'percent' },
  { path: 'growthHigh', label: 'Growth per year: High', kind: 'percent' },
  { path: 'inflationPerYear', label: 'Price inflation per year', kind: 'percent' },
  { path: 'nairaDevaluationPerYear', label: 'Naira devaluation per year', kind: 'percent' },
  {
    path: 'defaultRateExtra',
    label: 'Extra default rate (share of money drawn lost)',
    kind: 'percent',
  },
  { path: 'avgSystemPrice', label: 'Average system price (total payable)', kind: 'naira' },
  { path: 'avgCostPrice', label: 'Average cost price (equipment + installation)', kind: 'naira' },
  { path: 'depositShare', label: 'Average deposit', kind: 'percent' },
  { path: 'tenureMix.3', label: 'Tenure mix: 3 months', kind: 'percent' },
  { path: 'tenureMix.6', label: 'Tenure mix: 6 months', kind: 'percent' },
  { path: 'tenureMix.9', label: 'Tenure mix: 9 months', kind: 'percent' },
  { path: 'tenureMix.12', label: 'Tenure mix: 12 months', kind: 'percent' },
  { path: 'tenureMix.18', label: 'Tenure mix: 18 months', kind: 'percent' },
  { path: 'tenureMix.24', label: 'Tenure mix: 24 months', kind: 'percent' },
  { path: 'funderAnnualRate', label: 'Funder rate per year', kind: 'percent' },
  { path: 'ownFundShare', label: 'Share funded from own fund', kind: 'percent' },
  { path: 'unitCosts.kycPerLoan', label: 'KYC per loan', kind: 'naira' },
  { path: 'unitCosts.feePerInstalment', label: 'Payment fee per instalment', kind: 'naira' },
  {
    path: 'unitCosts.lossProvisionShare',
    label: 'Loss provision (share of balance)',
    kind: 'percent',
  },
  { path: 'overheadFixedPerMonthYear1', label: 'Fixed overheads per month, year 1', kind: 'naira' },
  { path: 'overheadGrowthPerYear', label: 'Overhead growth per year', kind: 'percent' },
  { path: 'overheadPerSystemYear1', label: 'Overhead per system, year 1', kind: 'naira' },
  {
    path: 'co2TonnesPerSystemYear',
    label: 'CO₂ avoided per system per year (tonnes)',
    kind: 'number',
  },
  { path: 'customersPerStaff', label: 'Customers per member of staff per year', kind: 'int' },
]

export function getInput(i: ScenarioInputs, path: string): number {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], i) as number
}

export function setInput(i: ScenarioInputs, path: string, value: number): ScenarioInputs {
  const [head, tail] = path.split('.') as [string, string | undefined]
  if (!tail) return { ...i, [head]: value }
  return {
    ...i,
    [head]: { ...(i as unknown as Record<string, Record<string, number>>)[head], [tail]: value },
  }
}

/** Which sample note (ScenarioInputs.sampleInputs) covers which input, by keyword. */
const SAMPLE_KEYWORDS: [RegExp, string][] = [
  [/^unitCosts\./, 'Unit costs'],
  [/^funderAnnualRate$/, 'Funder rate'],
  [/^ownFundShare$/, 'Own-fund'],
  [/^overhead/, 'Overheads'],
  [/^(avgSystemPrice|avgCostPrice|tenureMix\.)/, 'System price'],
  [/^(newPerMonthYear1|growth|inflationPerYear)/, 'New customers'],
  [/^co2/, 'CO₂'],
]

/** The sample / unverified note for one input, or null when it comes from real settings. */
export function sampleNote(path: string, sampleInputs: string[]): string | null {
  const keyword = SAMPLE_KEYWORDS.find(([re]) => re.test(path))?.[1]
  return (keyword && sampleInputs.find((s) => s.startsWith(keyword))) || null
}
