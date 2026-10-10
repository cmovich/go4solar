import {
  BookOpenText,
  ClipboardList,
  Hammer,
  LayoutDashboard,
  ListChecks,
  Mail,
  Plug,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type { AppRole, StaffRole } from '@/lib/auth/staffRoles'

type NavItem = { href: string; label: string; icon: LucideIcon; roles: readonly StaffRole[] }

const ALL: readonly StaffRole[] = [
  'super_admin',
  'credit_officer',
  'operations',
  'collections',
  'finance',
  'content',
]

/** PRD "Staff roles": who sees which module. super_admin sees everything. */
export const NAV: readonly NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  {
    href: '/admin/waitlist',
    label: 'Waiting list',
    icon: ListChecks,
    roles: ['super_admin', 'credit_officer', 'operations', 'content'],
  },
  {
    href: '/admin/applications',
    label: 'Applications',
    icon: ClipboardList,
    roles: ['super_admin', 'credit_officer'],
  },
  { href: '/admin/jobs', label: 'Jobs', icon: Hammer, roles: ['super_admin', 'operations'] },
  { href: '/admin/pricing', label: 'Pricing', icon: Tags, roles: ['super_admin'] },
  { href: '/admin/funders', label: 'Funders', icon: Wallet, roles: ['super_admin', 'finance'] },
  {
    href: '/admin/appliances',
    label: 'Appliances',
    icon: Plug,
    roles: ['super_admin', 'operations', 'content'],
  },
  { href: '/admin/staff', label: 'Staff', icon: Users, roles: ['super_admin'] },
  {
    href: '/admin/outbox',
    label: 'Outbox',
    icon: Mail,
    roles: ['super_admin', 'operations', 'collections', 'content'],
  },
  { href: '/admin/audit', label: 'Audit log', icon: BookOpenText, roles: ['super_admin'] },
]

export function navFor(role: AppRole | null): NavItem[] {
  return NAV.filter((n) => role !== null && (n.roles as readonly string[]).includes(role))
}
