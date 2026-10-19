import 'server-only'

import { publicSupabaseEnv } from '@/lib/supabase/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { deployEnv } from '@/lib/testmode/policy'

/** Public address of a file in the site-media bucket. */
export function siteMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `${publicSupabaseEnv().url}/storage/v1/object/public/site-media/${path}`
}

export type HomeTestimonial = {
  id: string
  quote: string
  clientName: string
  city: string
  systemSize: string
  installerName: string
  installerPhoto: string | null
  jobPhoto: string | null
}

export type HomePartner = {
  id: string
  name: string
  logo: string | null
  websiteUrl: string | null
}

/** Test rows (made by e2e accounts) never reach the live site; previews and local runs show them. */
const showTest = () => deployEnv() !== 'production'

/** Published testimonials for the home carousel, in order. Empty if none (or before 0020). */
export async function publishedTestimonials(): Promise<HomeTestimonial[]> {
  try {
    let q = createAdminClient()
      .from('testimonials')
      .select('*')
      .eq('published', true)
      .eq('consent_client', true)
      .eq('consent_installer', true)
      .order('sort_order')
    if (!showTest()) q = q.eq('is_test', false)
    const { data, error } = await q
    if (error) return []
    return data.map((t) => ({
      id: t.id,
      quote: t.client_quote,
      clientName: t.client_name,
      city: t.client_city,
      systemSize: t.system_size,
      installerName: t.installer_name,
      installerPhoto: siteMediaUrl(t.installer_photo),
      jobPhoto: siteMediaUrl(t.job_photo),
    }))
  } catch {
    return []
  }
}

/** Active partners for the home logo row, in order. Empty if none (or before 0020). */
export async function activePartners(): Promise<HomePartner[]> {
  try {
    let q = createAdminClient().from('partners').select('*').eq('active', true).order('sort_order')
    if (!showTest()) q = q.eq('is_test', false)
    const { data, error } = await q
    if (error) return []
    return data.map((p) => ({
      id: p.id,
      name: p.name,
      logo: siteMediaUrl(p.logo),
      websiteUrl: p.website_url,
    }))
  } catch {
    return []
  }
}
