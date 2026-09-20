# Theming

## Theme and color labels

The UI is dark by default (the light/dark toggle remembers your choice in `localStorage`).
Colors are CSS variables in `frontend/src/index.css`: shadcn tokens plus five accents
(`info` blue, `danger` red, `warning` amber, `success` green, `highlight` yellow), each with a
`-tint` (callout background) and `-fg` (text-safe) variant, defined for both themes.
Contrast was checked against WCAG AA; that is why some `-fg` values and the primary/destructive
button text differ from the raw accent hue.

Each note can have an optional color label (`blue`, `red`, `amber`, `green`, `yellow`), stored in
the nullable `notes.color` column (migration `0004`, backward compatible). `PATCH` with
`"color": null` clears it. The notes page can filter by label.

### Changing theme colors

All colors are CSS variables in **`frontend/src/index.css`**:

- `:root { ... }` holds the light theme and `.dark { ... }` the dark theme (dark is the default).
  Edit the values there; nothing else needs to change.
- The variables are the shadcn tokens (`--background`, `--card`, `--border`, `--primary`, ...) plus
  the accents `--info` (blue), `--danger` (red), `--warning` (amber), `--success` (green) and
  `--highlight` (yellow). Each accent has a `-tint` (callout background) and an `-fg` (text-safe
  color) variant.
- The `@theme inline { ... }` block maps the variables to Tailwind utilities (for example
  `--color-info` becomes `bg-info`, `text-info-fg`, `border-info`), so components use the names,
  never raw hex values.
- Note color labels use these accents: the class mapping is in `frontend/src/lib/note-colors.ts`,
  and the card left border and hover glow are the `.note-card` rules at the bottom of `index.css`.
- After changing colors, re-check WCAG AA contrast (see [Theme and color labels](#theme-and-color-labels)).
