import type { CategoryId } from './types'

/** Exact display names from CLAUDE.md section 9 / PRD Feature 3. */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  lighting: 'Lighting',
  tv_electronics: 'TV and Electronics',
  kitchen: 'Kitchen Appliances',
  cooling: 'Cooling and Comfort',
  laundry: 'Laundry and Home Care',
  water_outdoor: 'Water and Outdoor',
  business: 'Business and Office (SME)',
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && value in CATEGORY_LABELS
}
