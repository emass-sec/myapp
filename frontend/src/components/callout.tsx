import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type CalloutVariant = 'info' | 'danger' | 'warning' | 'success'

const STYLES: Record<CalloutVariant, { box: string; title: string }> = {
  info: { box: 'border-info bg-info-tint', title: 'text-info-fg' },
  danger: { box: 'border-danger bg-danger-tint', title: 'text-danger-fg' },
  warning: { box: 'border-warning bg-warning-tint', title: 'text-warning-fg' },
  success: { box: 'border-success bg-success-tint', title: 'text-success-fg' },
}

interface Props {
  variant: CalloutVariant
  title: string
  children?: ReactNode
  className?: string
}

/** Tinted box with a 1px accent border and a small uppercase heading in the accent color. */
export function Callout({ variant, title, children, className }: Props) {
  const s = STYLES[variant]
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-4 py-3', s.box, className)}
    >
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', s.title)}>{title}</p>
      {children && <div className="mt-1.5 text-sm text-foreground">{children}</div>}
    </div>
  )
}
