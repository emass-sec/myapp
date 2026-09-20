import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Monospace chip for technical values such as timestamps and usernames. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border bg-raised px-1.5 py-0.5 font-mono text-xs text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
