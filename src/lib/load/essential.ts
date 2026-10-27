import type { CategoryId } from './types'

/**
 * Items pre-ticked "Essential" when there is no saved choice: lights, fans, TVs and phone
 * charging (Semako, 27 Oct). The customer can change every tick.
 */
export function defaultEssential(item: { category: CategoryId | string; name: string }): boolean {
  if (item.category === 'lighting') return true
  return /\bfan\b|\bTV\b|phone charg/i.test(item.name)
}
