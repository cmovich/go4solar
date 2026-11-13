import { checkoutReturn } from '../../pay/returnHandler'

export const dynamic = 'force-dynamic'

/** Back from the pay-in-full checkout → My account (paid), or back to the payment page. */
export function GET(req: Request) {
  return checkoutReturn(req, '/app?paid=full', '/app/pay-in-full')
}
