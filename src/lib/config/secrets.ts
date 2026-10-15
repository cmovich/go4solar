/**
 * Server secrets that hash personal data (CLAUDE.md section 7). There is no built-in default in
 * the app: tests bring their own values, and every such value starts with LOCAL_TEST_SECRET_PREFIX
 * so it can never be used on Vercel.
 */
export const LOCAL_TEST_SECRET_PREFIX = 'local-test-only-'

const REQUIRED: { name: 'ID_HASH_SECRET' | 'GUARANTOR_TOKEN_SECRET'; min: number }[] = [
  { name: 'ID_HASH_SECRET', min: 32 },
  { name: 'GUARANTOR_TOKEN_SECRET', min: 16 },
]

const onVercel = (env: Record<string, string | undefined>) =>
  env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'production'

/** Problems that must stop a Vercel build (empty list = fine). Local builds have no requirement. */
export function deploySecretProblems(env: Record<string, string | undefined>): string[] {
  if (!onVercel(env)) return []
  const problems: string[] = []
  for (const { name, min } of REQUIRED) {
    const v = env[name]
    if (!v || v.length < min) problems.push(`${name} is missing or shorter than ${min} characters`)
    else if (v.startsWith(LOCAL_TEST_SECRET_PREFIX)) problems.push(`${name} is a local test value`)
  }
  return problems
}

/** Used by the hashing functions: a local test value is refused outside local runs. */
export function assertUsableSecret(
  name: string,
  secret: string,
  env: Record<string, string | undefined> = process.env,
) {
  if (onVercel(env) && secret.startsWith(LOCAL_TEST_SECRET_PREFIX)) {
    throw new Error(
      `${name} is a local test value. Set the real secret in Vercel (${env.VERCEL_ENV}).`,
    )
  }
}
