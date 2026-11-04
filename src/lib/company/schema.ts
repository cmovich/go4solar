import { z } from 'zod'

/** The company details printed on invoices (settings.company, admin "Company details"). */
export type Company = {
  name: string
  address: string
  phone: string
  email: string
  website: string
  rcNumber: string | null
}

export const DEFAULT_COMPANY: Company = {
  name: 'Go4Solar Energy Limited',
  address: 'Suite 40, Jayjay Shopping Complex, Kaduna',
  phone: '09018617165',
  email: 'contact@go4solar.app',
  website: 'www.go4solar.app',
  rcNumber: null,
}

const text = (max: number) => z.string().trim().min(1).max(max)

/** The saved setting, field by field: anything missing or broken uses the default. Pure. */
export function companyFrom(value: unknown): Company {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const pick = <K extends keyof Company>(k: K, schema: z.ZodType<Company[K]>) => {
    const p = schema.safeParse(v[k])
    return p.success ? p.data : DEFAULT_COMPANY[k]
  }
  return {
    name: pick('name', text(120)),
    address: pick('address', text(200)),
    phone: pick('phone', text(40)),
    email: pick('email', z.email()),
    website: pick('website', text(120)),
    rcNumber: pick('rcNumber', text(40).nullable()),
  }
}

/** The admin form: the company details and how long quotes and invoices stay valid. */
export const companyFormSchema = z.object({
  name: text(120),
  address: text(200),
  phone: text(40),
  email: z.email(),
  website: text(120),
  rcNumber: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .transform((v) => (v ? v : null)),
  quoteValidityDays: z.number().int().min(1).max(90),
})
export type CompanyForm = z.input<typeof companyFormSchema>

/** The RC number as printed: "RC 9560733" (a bare number gets the prefix; never doubled). Pure. */
export function rcLabel(rc: string | null | undefined): string | null {
  const digits = (rc ?? '')
    .trim()
    .replace(/^rc[\s:.-]*/i, '')
    .trim()
  return digits ? `RC ${digits}` : null
}

/** The Phone field may hold several numbers ("09018617165, 08031234567"): each one. Pure. */
export function companyPhones(phone: string): string[] {
  return phone
    .split(/[,·/;]/)
    .map((p) => p.trim())
    .filter(Boolean)
}
