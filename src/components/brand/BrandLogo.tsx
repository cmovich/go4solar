import Image from 'next/image'

import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

/**
 * The Go4Solar logo. On dark green use `onDark`: the white version (sun and panels in colour,
 * lettering white), with no white plate behind it. Elsewhere the full-colour version.
 */
export function BrandLogo({
  onDark = false,
  className,
  priority = false,
}: {
  onDark?: boolean
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src={onDark ? '/brand/go4solar-logo-white.png' : '/brand/go4solar-logo.png'}
      alt={siteConfig.name}
      width={330}
      height={249}
      priority={priority}
      className={cn('h-12 w-auto', className)}
    />
  )
}
