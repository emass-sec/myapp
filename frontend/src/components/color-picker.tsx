import type { NoteColor } from '@/api'
import { COLOR_STYLES, NOTE_COLORS } from '@/lib/note-colors'
import { cn } from '@/lib/utils'

interface Props {
  value: NoteColor | null
  onChange: (color: NoteColor | null) => void
}

/** Radio group of color swatches (native radios, so arrow keys and screen readers work). */
export function ColorPicker({ value, onChange }: Props) {
  const options: { id: NoteColor | null; label: string }[] = [
    { id: null, label: 'None' },
    ...NOTE_COLORS.map((c) => ({ id: c, label: COLOR_STYLES[c].label })),
  ]
  return (
    <div role="radiogroup" aria-label="Color label" className="flex flex-wrap gap-2">
      {options.map(({ id, label }) => (
        <label
          key={label}
          className="relative cursor-pointer"
        >
          <input
            type="radio"
            name="note-color"
            className="peer sr-only"
            checked={value === id}
            onChange={() => onChange(id)}
          />
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-input px-2.5 py-1 text-xs transition-colors',
              'hover:bg-accent peer-checked:border-ring peer-checked:bg-raised peer-checked:font-medium',
              'peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2.5 rounded-full',
                id ? COLOR_STYLES[id].swatch : 'border border-muted-foreground',
              )}
            />
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}
