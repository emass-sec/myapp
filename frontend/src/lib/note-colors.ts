import type { NoteColor } from '@/api'

export const NOTE_COLORS: NoteColor[] = ['blue', 'red', 'amber', 'green', 'yellow']

// Full class names so Tailwind can see them statically.
export const COLOR_STYLES: Record<NoteColor, { label: string; badge: string; swatch: string }> = {
  blue: { label: 'Blue', badge: 'border-info text-info-fg', swatch: 'bg-info' },
  red: { label: 'Red', badge: 'border-danger text-danger-fg', swatch: 'bg-danger' },
  amber: { label: 'Amber', badge: 'border-warning text-warning-fg', swatch: 'bg-warning' },
  green: { label: 'Green', badge: 'border-success text-success-fg', swatch: 'bg-success' },
  yellow: { label: 'Yellow', badge: 'border-highlight text-highlight-fg', swatch: 'bg-highlight' },
}
