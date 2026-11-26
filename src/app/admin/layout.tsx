import { PREVIEW_BANNER, isPreviewDeployment } from '@/lib/site/preview'

/** Every admin page (incl. two-factor): on a preview deployment, a warning that data is live. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const preview = isPreviewDeployment({ VERCEL_ENV: process.env.VERCEL_ENV })
  return (
    <>
      {preview && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-red-700 px-4 py-2 text-center text-sm font-bold text-white"
          data-testid="preview-banner"
        >
          {PREVIEW_BANNER}
        </div>
      )}
      {children}
    </>
  )
}
