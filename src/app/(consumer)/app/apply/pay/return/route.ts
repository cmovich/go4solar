import { checkoutReturn } from '../../../pay/returnHandler'

export const dynamic = 'force-dynamic'

/** Back from the deposit checkout → the auto-pay step. */
export function GET(req: Request) {
  return checkoutReturn(req, '/app/apply/pay', '/app/apply/pay')
}
