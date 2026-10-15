import { cn } from '@/lib/utils'

type BandProps = {
  children: React.ReactNode
  className?: string
  /** Slope the bottom edge up towards the right, like the PRD's header bands. */
  angled?: boolean
  /** Small orange triangle in the top-right corner. */
  accent?: boolean
  id?: string
}

/** Deep-green section band used for the hero, the partners call and the footer. */
export function Band({ children, className, angled = false, accent = false, id }: BandProps) {
  return (
    <section
      id={id}
      className={cn('bg-brand-dark relative overflow-hidden text-white', className)}
      style={
        angled
          ? { clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - clamp(24px, 4vw, 56px)), 0 100%)' }
          : undefined
      }
    >
      {accent && (
        <span
          aria-hidden
          className="bg-brand-orange absolute top-0 right-0 h-20 w-20 sm:h-28 sm:w-28"
          style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
        />
      )}
      {children}
    </section>
  )
}

/** Centred content column with the page gutter. */
export function Container({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
}

/** Section heading pair used on the white sections. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  light = false,
}: {
  eyebrow: string
  title: string
  lead?: string
  light?: boolean
}) {
  return (
    <div className="max-w-2xl">
      <p
        className={cn(
          'text-sm font-semibold tracking-wide uppercase',
          light ? 'text-brand-gold' : 'text-brand-green',
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          'mt-2 text-3xl font-bold tracking-tight sm:text-4xl',
          light ? 'text-white' : 'text-brand-dark',
        )}
      >
        {title}
      </h2>
      {lead && (
        <p className={cn('mt-3 text-lg', light ? 'text-white/80' : 'text-muted-foreground')}>
          {lead}
        </p>
      )}
    </div>
  )
}
