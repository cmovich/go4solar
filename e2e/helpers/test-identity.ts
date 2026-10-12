/**
 * Every fake person a test creates (customer, guarantor, next of kin, installer, staff) uses these,
 * so test data is easy to find and is excluded from reports:
 *   - email ends in @go4solar.test (profiles.is_test is set automatically for these)
 *   - phone starts +234800000 (local 0800000…)
 * People testing by hand use Gmail plus-addresses with "+g4stest" (infosemako+g4stest1@gmail.com);
 * the database flags those as test too (migration 0016). Staff are test only with @go4solar.test.
 * Tests share the main Supabase project, so never use a real-looking email or phone in a test.
 */
export const TEST_EMAIL_DOMAIN = 'go4solar.test'
export const TEST_PHONE_PREFIX = '+234800000'
/** The funder every test approval draws from (is_test = true). Never a real or SAMPLE funder. */
export const TEST_FUNDER_NAME = 'E2E TEST FUNDER'

const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')

/** A fresh test phone in local form (0800000XXXX), as a person would type it. */
export function testPhone(): string {
  return `0${TEST_PHONE_PREFIX.slice(4)}${digits(4)}`
}

/** The same phone in E.164 (+234800000XXXX), as stored. */
export function toE164(localPhone: string): string {
  return `+234${localPhone.slice(1)}`
}

/** A test email: e2e-<label>-<unique>@go4solar.test */
export function testEmail(label: string, unique: string = digits(8)): string {
  return `e2e-${label}-${unique}@${TEST_EMAIL_DOMAIN}`
}

/**
 * A plus-address test email (the rule Semako's manual tests use): e2e+g4stest-<label>-<unique>@go4solar.app.
 * Flagged test by the "+g4stest" rule, not by the domain. Accounts are created confirmed: no mail is sent.
 */
export function testPlusEmail(label: string, unique: string = digits(8)): string {
  return `e2e+g4stest-${label}-${unique}@go4solar.app`
}

/** An email that is NOT a test identity by itself (use only together with a test phone). */
export function plainEmailWithTestPhone(label: string, unique: string = digits(8)): string {
  return `e2e-${label}-${unique}@go4solar.app`
}

/** A NIN the mock KYC accepts (11 digits starting with 1), new every run: one active application per NIN. */
export function testNin(): string {
  return `1${digits(10)}`
}

export function isTestEmail(email: string | null | undefined): boolean {
  const e = email?.toLowerCase() ?? ''
  return e.endsWith(`@${TEST_EMAIL_DOMAIN}`) || e.split('@')[0]!.includes('+g4stest')
}
