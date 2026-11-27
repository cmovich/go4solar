import { previewBanner } from '@/lib/site/preview'

/** Every admin page (incl. two-factor): on a preview deployment, which database it uses. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const banner = previewBanner({
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })
  return (
    <>
      {banner && (
        <div
          role="alert"
          className={
            banner.tone === 'live'
              ? 'sticky top-0 z-50 bg-red-700 px-4 py-2 text-center text-sm font-bold text-white'
              : 'bg-brand-gold text-brand-dark sticky top-0 z-50 px-4 py-2 text-center text-sm font-bold'
          }
          data-testid="preview-banner"
        >
          {banner.text}
        </div>
      )}
      {children}
    </>
  )
}
