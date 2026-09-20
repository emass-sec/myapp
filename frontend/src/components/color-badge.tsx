import type { NoteColor } from '@/api'
import { COLOR_STYLES } from '@/lib/note-colors'
import { cn } from '@/lib/utils'

/** Outlined, rounded tag in the label's accent color. */
export function ColorBadge({ color, className }: { color: NoteColor; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        COLOR_STYLES[color].badge,
        className,
      )}
    >
      {COLOR_STYLES[color].label}
    </span>
  )
}
