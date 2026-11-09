'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Builder } from '@/components/build/Builder'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LaunchMode } from '@/config/site'
import type { LibraryItem } from '@/lib/calculator/store'
import type { BuilderItem } from '@/lib/catalogue/server'
import { NG_STATE_IDS, stateLabel, type NgStateId } from '@/lib/nigeria/states'
import type { WiringSettings } from '@/lib/wizard/questions'
import type { RoofTypeCard } from '@/lib/wizard/server'

import { createQuotation } from '@/app/admin/(shell)/quotations/actions'

/**
 * Admin → New quotation: optional customer name and phone, the state (prices, delivery and sun
 * hours), then the system builder exactly as customers use it, ending with "Create quotation".
 */
export function StaffQuotationForm({
  items,
  roofTypes,
  wiring,
  library,
  launchMode,
  showPrices,
}: {
  items: BuilderItem[]
  roofTypes: RoofTypeCard[]
  wiring: WiringSettings
  library: LibraryItem[]
  launchMode: LaunchMode
  showPrices: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<NgStateId | ''>('')
  return (
    <div className="space-y-8">
      <fieldset className="bg-brand-mist space-y-3 rounded-2xl p-4" data-testid="quote-customer">
        <legend className="text-brand-dark float-left mb-3 w-full font-semibold">
          Customer (optional)
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="q-name">Name</Label>
            <Input
              id="q-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 bg-white"
            />
          </div>
          <div>
            <Label htmlFor="q-phone">Phone</Label>
            <Input
              id="q-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 h-11 bg-white"
              placeholder="0803 123 4567"
            />
          </div>
          <div>
            <Label htmlFor="q-state">State</Label>
            <select
              id="q-state"
              value={state}
              onChange={(e) => setState(e.target.value as NgStateId | '')}
              className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
            >
              <option value="">Choose the state</option>
              {NG_STATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {stateLabel(id)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          The state sets the installation and delivery prices and the sun hours. Name and phone are
          only printed on the quotation and used for the WhatsApp message.
        </p>
      </fieldset>

      <Builder
        items={items}
        roofTypes={roofTypes}
        wiring={wiring}
        launchMode={launchMode}
        showPrices={showPrices}
        initial={null}
        done={false}
        staff={{
          state: state || null,
          library,
          onCreate: async ({ selection, depositShare, tenure }) => {
            const r = await createQuotation({
              customer: { name, phone, state },
              selection,
              depositShare,
              tenure,
            })
            if (!r.ok) return r.error
            router.push(`/admin/quotations/${r.id}`)
            return null
          },
        }}
      />
    </div>
  )
}
