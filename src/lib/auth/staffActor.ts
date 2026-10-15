import 'server-only'

import { getSessionInfo } from './session'
import { isStaffRole } from './staffRoles'

/** The signed-in staff member for a server action (two-factor verified), or null. */
export async function staffActor() {
  const s = await getSessionInfo()
  if (!s.user || !isStaffRole(s.role) || s.aal !== 'aal2') return null
  return { id: s.user.id, role: s.role }
}
