import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rise flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center', className)}>
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-text">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="text-lg">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
