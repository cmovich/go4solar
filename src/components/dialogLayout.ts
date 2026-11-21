/**
 * Pop-up windows (shadcn Dialog) never grow taller than the screen: the window scrolls inside,
 * and the button bar (DialogFooter) stays pinned to its bottom edge so Save / Cancel are always
 * on screen, on a laptop and on a phone. The shadcn primitive itself is left as the CLI made it.
 * The window has no bottom padding (the footer brings its own), so nothing shows below the bar.
 */
export const DIALOG_SCROLL = 'max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain pb-0'

/** The footer (opaque, above the fields) is pinned to the bottom edge of the scrolling window. */
export const DIALOG_FOOTER_PINNED = 'sticky bottom-0 z-10 mb-0 bg-muted'
