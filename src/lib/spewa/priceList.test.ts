import { describe, expect, it } from 'vitest'

import {
  PRICE_COLUMNS,
  itemFlags,
  mapProduct,
  parseSpewaCsv,
  priceOf,
  type SpewaItem,
} from './priceList'

const CSV = `no,category,code,product,brand,warranty,showroom,installer,level_b,level_a,big_dealer
1,Lights,SPW-LGT-0001,All in One Streetlight - 12 bulbs (100W),,3 years,190000,185000,180000,170000,165000
7,Lights,SPW-LGT-0007,Flood Lights FL-E4-150W,INFINISOLAR,2 years,,,,,
10,Batteries,SPW-BAT-0003,InfiniSolar Lithium ion Battery 12V/210ah,INFINISOLAR,2 years,300000,290000,280000,270000,260000
16,Batteries,SP-0012,Solarpro 5kWh High Voltage Rack-mounted Energy Storage System,SOLARPRO,7 years,1153846,1115384,1076925,1038462,1061950
31,Inverters,SPW-SLS-0004,Solis 12kW/48V S6-EH1P12K03-NV-YD-L On Grid,SOLIS,5 years,2300000,2200000,2000000,1900000,1750000
39,Inverters,SP-0017,Solis 80kW HV S6-EH3P125K-H,SOLIS,7 years,8000000,7900000,7800000,7250000,7000000
45,Solar panels,SP-0001,550W Solarpro Monocrystalline Monofacial Solar Panel,SOLARPRO,25 years,118000,113000,108000,103000,100000
`

describe('parseSpewaCsv', () => {
  const rows = parseSpewaCsv(CSV)

  it('reads every row with its five price columns (empty = no price)', () => {
    expect(rows).toHaveLength(7)
    expect(rows[0]).toMatchObject({
      itemNo: 1,
      category: 'Lights',
      code: 'SPW-LGT-0001',
      brand: null,
      warranty: '3 years',
      prices: {
        showroom: 190000,
        installer: 185000,
        level_b: 180000,
        level_a: 170000,
        big_dealer: 165000,
      },
    })
    expect(rows[1]!.prices).toEqual({
      showroom: null,
      installer: null,
      level_b: null,
      level_a: null,
      big_dealer: null,
    })
  })

  it('switches off items with no price', () => {
    expect(rows[0]!.active).toBe(true)
    expect(rows[1]!.active).toBe(false)
  })

  it('maps each item for the sizing engine and the builder', () => {
    expect(rows.find((r) => r.code === 'SPW-SLS-0004')).toMatchObject({
      kind: 'inverter',
      ratingKw: 12,
      voltage: 48,
      highVoltage: false,
    })
    expect(rows.find((r) => r.code === 'SPW-BAT-0003')).toMatchObject({
      kind: 'battery',
      voltage: 12,
      kwh: 2.52,
    })
    expect(rows.find((r) => r.code === 'SP-0012')).toMatchObject({
      kind: 'battery',
      kwh: 5,
      voltage: null,
      highVoltage: true,
    })
    expect(rows.find((r) => r.code === 'SP-0001')).toMatchObject({ kind: 'panel', watts: 550 })
    expect(rows[0]).toMatchObject({ kind: 'light', watts: 100 })
  })

  it('refuses a file without the expected columns', () => {
    expect(() => parseSpewaCsv('a,b\n1,2')).toThrow(/column/)
  })

  it('reads quoted fields with commas', () => {
    const r = parseSpewaCsv(
      'no,category,code,product,brand,warranty,showroom,installer,level_b,level_a,big_dealer\n' +
        '2,Lights,X-1,"Lamp, 60W",,1 year,1,2,3,4,5\n',
    )
    expect(r[0]!.product).toBe('Lamp, 60W')
  })
})

describe('mapProduct', () => {
  it.each([
    ['Inverters', 'Solis 10kW/48V 3Phase S6-EH3P10K02-NV-YD-L On Grid', { kind: 'inverter', ratingKw: 10, voltage: 48 }],
    ['Inverters', 'Solis 125kW HV S6-EH3P125K-H', { kind: 'inverter', ratingKw: 125, highVoltage: true }],
    ['Inverters', 'Solis 5kW/48V S6-EO1P5K-48 Off-grid', { kind: 'inverter', ratingKw: 5, voltage: 48 }],
    ['Batteries', 'Felicity 15KWH Lithium Battery', { kind: 'battery', kwh: 15, voltage: null }],
    ['Batteries', 'InfiniSolar Lithium ion Battery 48V/10.2KWH', { kind: 'battery', kwh: 10.2, voltage: 48 }],
    ['Batteries', 'Sungene Lithium ion Battery 24V/300ah', { kind: 'battery', kwh: 7.2, voltage: 24 }],
    ['Batteries', 'Solis EverCore ESS 261kWh High Voltage Energy Storage System', { kind: 'battery', kwh: 261, highVoltage: true }],
    ['Batteries', 'Solis Lithium-Ion Battery Module 20kWh', { kind: 'battery', kwh: 20 }],
    ['Solar panels', 'SolarPro 630W Monocrystalline Bifacial Solar Panel', { kind: 'panel', watts: 630 }],
    ['Lights', 'Flood Lights FL-E4-300W', { kind: 'light', watts: 300 }],
  ] as const)('%s: %s', (category, product, expected) => {
    expect(mapProduct(category, product)).toMatchObject(expected)
  })
})

const item = (over: Partial<SpewaItem>): SpewaItem => ({
  id: 'x',
  itemNo: 1,
  category: 'Inverters',
  code: 'C',
  product: 'Solis 12kW/48V S6-EH1P12K03-NV-YD-L',
  brand: null,
  warranty: null,
  prices: { showroom: 5, installer: 4, level_b: 3, level_a: 2, big_dealer: 1 },
  kind: 'inverter',
  ratingKw: 12,
  voltage: 48,
  highVoltage: false,
  kwh: null,
  watts: null,
  active: true,
  sortOrder: 1,
  ...over,
})

describe('itemFlags', () => {
  it('flags a lower level priced above the one before it (item 16: big dealer > level A)', () => {
    const flags = itemFlags(
      item({
        category: 'Batteries',
        kind: 'battery',
        kwh: 5,
        product: 'Solarpro 5kWh High Voltage Rack-mounted Energy Storage System',
        prices: {
          showroom: 1153846,
          installer: 1115384,
          level_b: 1076925,
          level_a: 1038462,
          big_dealer: 1061950,
        },
      }),
    )
    expect(flags).toEqual(['Big dealer (₦1,061,950) is higher than Level A (₦1,038,462).'])
  })

  it('flags a name whose kW differs from the model code (item 39: 80kW vs 125K)', () => {
    expect(itemFlags(item({ product: 'Solis 80kW HV S6-EH3P125K-H', ratingKw: 80 }))).toEqual([
      'The name says 80 kW but the model code says 125K. Check which is right.',
    ])
  })

  it('flags a switched-on item without the partner or selling price, and unmapped sizes', () => {
    const flags = itemFlags(
      item({ prices: { ...item({}).prices, installer: null }, ratingKw: null }),
      { partnerColumn: 'big_dealer', sellingColumn: 'installer' },
    )
    expect(flags).toContain('No Installer price: this item cannot be quoted.')
    expect(flags).toContain('Inverter size (kW) is missing.')
  })

  it('a clean item has no flags', () => {
    expect(itemFlags(item({}))).toEqual([])
  })
})

describe('priceOf', () => {
  it('reads the chosen column', () => {
    const i = item({})
    expect(PRICE_COLUMNS.map((c) => priceOf(i, c))).toEqual([5, 4, 3, 2, 1])
  })
})
