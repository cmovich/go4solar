import {
  Camera,
  Zap,
  Building2,
  BookOpenText,
  ChartLine,
  ClipboardList,
  FileSignature,
  Hammer,
  Home,
  Handshake,
  LayoutDashboard,
  ListChecks,
  Mail,
  Plug,
  Quote,
  ReceiptText,
  Tags,
  TrendingUp,
  UserPen,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { isStaffRole, type AppRole, type StaffRole } from '@/lib/auth/staffRoles'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  roles: readonly StaffRole[]
  /** Also shown to any staff role given this permission on /admin/staff. */
  permission?: 'create_quotations'
}

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
    href: '/admin/grid-insights',
    label: 'Grid insights',
    icon: Zap,
    roles: ['super_admin', 'credit_officer', 'operations', 'content'],
  },
  {
    href: '/admin/applications',
    label: 'Applications',
    icon: ClipboardList,
    roles: ['super_admin', 'credit_officer'],
  },
  {
    href: '/admin/change-requests',
    label: 'Change requests',
    icon: UserPen,
    roles: ['super_admin', 'operations'],
  },
  {
    href: '/admin/jobs',
    label: 'Jobs',
    icon: Hammer,
    roles: ['super_admin', 'operations', 'finance'],
  },
  {
    href: '/admin/quotations',
    label: 'Quotations',
    icon: ReceiptText,
    roles: ['super_admin'],
    permission: 'create_quotations',
  },
  { href: '/admin/pricing', label: 'Pricing', icon: Tags, roles: ['super_admin'] },
  { href: '/admin/profit', label: 'Profit', icon: TrendingUp, roles: ['super_admin', 'finance'] },
  {
    href: '/admin/forecasts',
    label: 'Forecasts',
    icon: ChartLine,
    roles: ['super_admin', 'finance'],
  },
  { href: '/admin/funders', label: 'Funders', icon: Wallet, roles: ['super_admin', 'finance'] },
  {
    href: '/admin/appliances',
    label: 'Appliances',
    icon: Plug,
    roles: ['super_admin', 'operations', 'content'],
  },
  { href: '/admin/agreements', label: 'Agreements', icon: FileSignature, roles: ['super_admin'] },
  { href: '/admin/company', label: 'Company details', icon: Building2, roles: ['super_admin'] },
  { href: '/admin/photo-lookup', label: 'Photo lookup', icon: Camera, roles: ['super_admin'] },
  { href: '/admin/staff', label: 'Staff', icon: Users, roles: ['super_admin'] },
  {
    href: '/admin/outbox',
    label: 'Outbox',
    icon: Mail,
    roles: ['super_admin', 'operations', 'collections', 'content'],
  },
  {
    href: '/admin/testimonials',
    label: 'Testimonials',
    icon: Quote,
    roles: ['super_admin', 'content'],
  },
  {
    href: '/admin/partners',
    label: 'Partners',
    icon: Handshake,
    roles: ['super_admin', 'content'],
  },
  {
    href: '/admin/roof-types',
    label: 'Roof types',
    icon: Home,
    roles: ['super_admin', 'content'],
  },
  { href: '/admin/audit', label: 'Audit log', icon: BookOpenText, roles: ['super_admin'] },
]

export function navFor(role: AppRole | null, permissions: readonly string[] = []): NavItem[] {
  if (!isStaffRole(role)) return []
  return NAV.filter(
    (n) =>
      (n.roles as readonly string[]).includes(role) ||
      (n.permission !== undefined && permissions.includes(n.permission)),
  )
}
