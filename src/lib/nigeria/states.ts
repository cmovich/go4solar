/**
 * The 36 states plus the FCT. Go4Solar serves all of Nigeria: no state is special. Ids are stable
 * (FCT's id is 'FCT'); labels are what people see.
 */
const STATES = [
  'Abia',
  'FCT',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const

export type NgStateId = (typeof STATES)[number]

/** All 37 ids, A–Z by the name people see ("Abuja (FCT)" sits between Abia and Adamawa). */
export const NG_STATE_IDS: readonly NgStateId[] = STATES

export function stateLabel(id: string): string {
  return id === 'FCT' ? 'Abuja (FCT)' : id
}

export function isNgStateId(value: unknown): value is NgStateId {
  return typeof value === 'string' && (NG_STATE_IDS as readonly string[]).includes(value)
}
