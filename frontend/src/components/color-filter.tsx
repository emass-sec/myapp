import type { NoteColor } from '@/api'
import { COLOR_STYLES, NOTE_COLORS } from '@/lib/note-colors'
import { cn } from '@/lib/utils'

export type ColorFilterValue = NoteColor | 'all'

interface Props {
  value: ColorFilterValue
  counts: Record<NoteColor, number>
  total: number
  onChange: (value: ColorFilterValue) => void
}

export function ColorFilter({ value, counts, total, onChange }: Props) {
  const items: { id: ColorFilterValue; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: total },
    ...NOTE_COLORS.map((c) => ({ id: c, label: COLOR_STYLES[c].label, count: counts[c] })),
  ]
  return (
    <div role="group" aria-label="Filter by color" className="flex flex-wrap gap-2">
      {items.map(({ id, label, count }) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'border-ring bg-raised font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {id !== 'all' && (
              <span aria-hidden className={cn('size-2.5 rounded-full', COLOR_STYLES[id].swatch)} />
            )}
            {label}
            <span className="font-mono text-xs text-muted-foreground">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
