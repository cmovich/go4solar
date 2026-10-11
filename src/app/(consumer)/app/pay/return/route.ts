import { checkoutReturn } from '../returnHandler'

export const dynamic = 'force-dynamic'

/** Back from paying an instalment → the dashboard. */
export function GET(req: Request) {
  return checkoutReturn(req, '/app?payment=received', '/app')
}
