'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { MEDIA_KINDS, MAX_UPLOAD_BYTES, uploadProblem, type MediaKind } from '@/lib/media/rules'
import { sniffImage } from '@/lib/media/sniff'
import { createClient } from '@/lib/supabase/server'

import { moveInList, partnerSchema, publishProblem, testimonialSchema } from './schemas'

/**
 * Home-page content (testimonials, partners, their pictures). Writes use the staff member's own
 * session, so Row Level Security applies and the audit triggers record who changed what.
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const DENIED = {
  ok: false,
  error: 'Only a super admin or content staff can change the home page.',
} as const

async function contentStaff(): Promise<boolean> {
  const s = await getSessionInfo()
  return Boolean(s.user && (s.role === 'super_admin' || s.role === 'content') && s.aal === 'aal2')
}

function changed(admin: string) {
  revalidatePath('/')
  revalidatePath(admin)
}

const idSchema = z.object({ id: z.uuid() })
const publishSchema = z.object({ id: z.uuid(), published: z.boolean() })
const activeSchema = z.object({ id: z.uuid(), active: z.boolean() })
const moveSchema = z.object({ id: z.uuid(), dir: z.enum(['up', 'down']) })

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the form'

// ------------------------------------------------------------------ pictures
const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
}

/** Stores a picture the browser has already cropped and compressed; checks the real bytes again. */
export async function uploadSiteImage(form: FormData): Promise<Result<{ path: string }>> {
  if (!(await contentStaff())) return DENIED
  const kind = form.get('kind')
  const file = form.get('file')
  if (typeof kind !== 'string' || !(kind in MEDIA_KINDS) || !(file instanceof File)) {
    return { ok: false, error: 'Choose a picture to upload.' }
  }
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: 'That picture is larger than 10 MB.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniffImage(bytes)
  const svgText = sniffed?.type === 'image/svg+xml' ? new TextDecoder().decode(bytes) : null
  const problem = uploadProblem(kind as MediaKind, bytes.byteLength, sniffed, svgText)
  if (problem || !sniffed) return { ok: false, error: problem ?? 'That file is not a picture.' }

  const path = `${kind}/${randomUUID()}.${EXT[sniffed.type]}`
  const supabase = await createClient()
  const { error } = await supabase.storage.from('site-media').upload(path, bytes, {
    contentType: sniffed.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) {
    console.error(`[site-media] upload failed: ${error.message}`)
    return { ok: false, error: 'Could not upload the picture. Please try again.' }
  }
  return { ok: true, path }
}

// ------------------------------------------------------------------ testimonials
export async function saveTestimonial(
  input: unknown,
): Promise<Result<{ id?: string; unpublished?: boolean }>> {
  if (!(await contentStaff())) return DENIED
  const parsed = testimonialSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  const d = parsed.data
  const row = {
    client_name: d.clientName,
    client_city: d.clientCity,
    client_quote: d.clientQuote,
    system_size: d.systemSize,
    installer_name: d.installerName,
    installer_photo: d.installerPhoto ?? null,
    job_photo: d.jobPhoto ?? null,
    consent_client: d.consentClient,
    consent_installer: d.consentInstaller,
  }
  const supabase = await createClient()
  if (d.id) {
    const { data: current } = await supabase
      .from('testimonials')
      .select('published')
      .eq('id', d.id)
      .maybeSingle()
    // Without both consents a testimonial can never stay on the home page.
    const unpublish = Boolean(current?.published) && publishProblem(d) !== null
    const { error } = await supabase
      .from('testimonials')
      .update({ ...row, ...(unpublish ? { published: false } : {}) })
      .eq('id', d.id)
    if (error) return { ok: false, error: 'Could not save the testimonial. Please try again.' }
    changed('/admin/testimonials')
    return unpublish ? { ok: true, unpublished: true } : { ok: true }
  }
  const { data: all } = await supabase.from('testimonials').select('sort_order')
  const next = Math.max(0, ...(all ?? []).map((r) => Number(r.sort_order) || 0)) + 1
  const { error } = await supabase.from('testimonials').insert({ ...row, sort_order: next })
  if (error) return { ok: false, error: 'Could not save the testimonial. Please try again.' }
  changed('/admin/testimonials')
  return { ok: true }
}

export async function setTestimonialPublished(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  const parsed = publishSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const supabase = await createClient()
  if (parsed.data.published) {
    const { data: t } = await supabase
      .from('testimonials')
      .select('consent_client, consent_installer')
      .eq('id', parsed.data.id)
      .maybeSingle()
    if (!t) return { ok: false, error: 'That testimonial no longer exists.' }
    const problem = publishProblem({
      consentClient: t.consent_client,
      consentInstaller: t.consent_installer,
    })
    if (problem) return { ok: false, error: problem }
  }
  const { error } = await supabase
    .from('testimonials')
    .update({ published: parsed.data.published })
    .eq('id', parsed.data.id)
  if (error) return { ok: false, error: 'Could not change it. Please try again.' }
  changed('/admin/testimonials')
  return { ok: true }
}

async function move(table: 'testimonials' | 'partners', input: unknown): Promise<Result> {
  const parsed = moveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const supabase = await createClient()
  const { data: list } = await supabase.from(table).select('id, sort_order').order('sort_order')
  const ids = (list ?? []).map((r) => r.id as string)
  const order = moveInList(ids, parsed.data.id, parsed.data.dir)
  // Rewrite only the rows whose position changed.
  for (const [i, id] of order.entries()) {
    const was = (list ?? []).find((r) => r.id === id)?.sort_order
    if (was === i + 1) continue
    const { error } = await supabase
      .from(table)
      .update({ sort_order: i + 1 })
      .eq('id', id)
    if (error) return { ok: false, error: 'Could not change the order. Please try again.' }
  }
  changed(`/admin/${table}`)
  return { ok: true }
}

export async function moveTestimonial(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  return move('testimonials', input)
}

export async function deleteTestimonial(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const { error } = await (
    await createClient()
  )
    .from('testimonials')
    .delete()
    .eq('id', parsed.data.id)
  if (error) return { ok: false, error: 'Could not delete it. Please try again.' }
  changed('/admin/testimonials')
  return { ok: true }
}

// ------------------------------------------------------------------ partners
export async function savePartner(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  const parsed = partnerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  const d = parsed.data
  const row = { name: d.name, logo: d.logo ?? null, website_url: d.websiteUrl || null }
  const supabase = await createClient()
  if (d.id) {
    const { error } = await supabase.from('partners').update(row).eq('id', d.id)
    if (error) return { ok: false, error: 'Could not save the partner. Please try again.' }
  } else {
    const { data: all } = await supabase.from('partners').select('sort_order')
    const next = Math.max(0, ...(all ?? []).map((r) => Number(r.sort_order) || 0)) + 1
    const { error } = await supabase.from('partners').insert({ ...row, sort_order: next })
    if (error) return { ok: false, error: 'Could not save the partner. Please try again.' }
  }
  changed('/admin/partners')
  return { ok: true }
}

export async function setPartnerActive(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  const parsed = activeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const { error } = await (
    await createClient()
  )
    .from('partners')
    .update({ active: parsed.data.active })
    .eq('id', parsed.data.id)
  if (error) return { ok: false, error: 'Could not change it. Please try again.' }
  changed('/admin/partners')
  return { ok: true }
}

export async function movePartner(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  return move('partners', input)
}

export async function deletePartner(input: unknown): Promise<Result> {
  if (!(await contentStaff())) return DENIED
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const { error } = await (await createClient()).from('partners').delete().eq('id', parsed.data.id)
  if (error) return { ok: false, error: 'Could not delete it. Please try again.' }
  changed('/admin/partners')
  return { ok: true }
}
