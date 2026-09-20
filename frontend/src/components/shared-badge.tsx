import { Users } from 'lucide-react'

/** Marks one of my notes as visible to all users. */
export function SharedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-info px-2 py-0.5 text-[11px] font-medium text-info-fg">
      <Users className="size-3" aria-hidden />
      Shared
    </span>
  )
}
