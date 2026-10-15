import 'server-only'

import { cookies } from 'next/headers'

import { showTestFrom } from '@/components/admin/TestDataToggle'

import { TEST_MODE_COOKIE, deployEnv, testSwitchesAllowed } from './policy'

/** Are test-only switches on for this request? (production never; previews after unlocking.) */
export async function testSwitchesOn(): Promise<boolean> {
  const cookie = (await cookies()).get(TEST_MODE_COOKIE)?.value ?? null
  return testSwitchesAllowed({ env: deployEnv(), secret: process.env.TEST_MODE_SECRET, cookie })
}

/** "?test=1" (show test data) only counts where test switches are allowed. */
export async function includeTestData(param: string | string[] | undefined): Promise<boolean> {
  return showTestFrom(param) && (await testSwitchesOn())
}
