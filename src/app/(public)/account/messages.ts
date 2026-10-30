/** "You're signed in as X…" (account page and its actions; not a 'use server' file). */
export function signedInAsMessage(name: string | null): string {
  const who = name || 'another account'
  return `You're signed in as ${who}. Continue as ${who}, or sign out to apply as someone else.`
}
