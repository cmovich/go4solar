import { describe, expect, it } from 'vitest'

import { invoiceFinancing } from './financing'

const line = (
  item: string,
  amount: number,
  kind: 'equipment' | 'installation' | 'delivery' | 'charge',
) => ({
  item,
  spec: '',
  qty: '1',
  amount,
  kind,
})

describe('invoiceFinancing', () => {
  it('SPEWA demo invoice G4S-INV-2026-0006 (stored before this change): financed, charge, balance', () => {
    const f = invoiceFinancing({
      lines: [
        line('Solis 5kW/48V', 520_000, 'equipment'),
        line('MUST Lithium ion Battery 48V/5KWH', 940_000, 'equipment'),
        line('330W Sungene', 169_500, 'equipment'),
        line('Protection, cables and mounting', 185_400, 'equipment'),
        line('Installation', 125_050, 'installation'),
        line('Delivery — Go4Solar logistics (Kaduna)', 100_000, 'delivery'),
        line('Payment plan charge (12 months, 30%)', 428_390, 'charge'),
      ],
      totals: {
        total: 2_468_340,
        deposit: 611_985,
        depositShare: 0.3,
        balance: 1_856_355,
        monthly: 154_696,
        months: 12,
      },
    })
    expect(f).toEqual({
      financed: 1_427_965,
      chargeLabel: 'Payment plan charge (12 months, 30%)',
      charge: 428_390,
      balance: 1_856_355,
    })
  })

  it('home quotes (no separate charge): nothing extra to show', () => {
    expect(
      invoiceFinancing({
        lines: [line('1 kVA inverter', 493_688, 'equipment')],
        totals: {
          total: 693_688,
          deposit: 138_738,
          depositShare: 0.2,
          balance: 554_950,
          monthly: 46_246,
          months: 12,
        },
      }),
    ).toBeNull()
  })

  it('paid in full (no months): nothing to show', () => {
    expect(
      invoiceFinancing({
        lines: [line('Payment plan charge (12 months, 30%)', 10, 'charge')],
        totals: { total: 100, deposit: 100, depositShare: 1, balance: 0, monthly: 0, months: 0 },
      }),
    ).toBeNull()
  })
})
