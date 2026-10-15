/** The 36 states plus the FCT. Ids are stable; labels are what people see. */
export const LAUNCH_STATE_IDS = ['FCT', 'Kaduna', 'Lagos'] as const
export type LaunchStateId = (typeof LAUNCH_STATE_IDS)[number]

const OTHER_STATES = [
  'Abia',
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
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
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

export type NgStateId = LaunchStateId | (typeof OTHER_STATES)[number]

/** All 37 ids: launch states first, then the rest A–Z (the order the dropdown shows). */
export const NG_STATE_IDS: readonly NgStateId[] = [...LAUNCH_STATE_IDS, ...OTHER_STATES]

export function stateLabel(id: string): string {
  return id === 'FCT' ? 'Abuja (FCT)' : id
}

export function isNgStateId(value: unknown): value is NgStateId {
  return typeof value === 'string' && (NG_STATE_IDS as readonly string[]).includes(value)
}

export function isLaunchState(id: string): id is LaunchStateId {
  return (LAUNCH_STATE_IDS as readonly string[]).includes(id)
}

/** Dropdown groups: launch states, then a divider, then the rest. */
export const STATE_GROUPS: { label: string; ids: readonly NgStateId[] }[] = [
  { label: 'Launch states', ids: LAUNCH_STATE_IDS },
  { label: 'Other states', ids: OTHER_STATES },
]
