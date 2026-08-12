'use client'

import { cn } from '@/lib/utils'

// Componentes compartilhados das paginas de configuracoes
// (extraidos do padrao inline de configuracoes-view.tsx)

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="py-10 border-b border-border">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[14px] font-medium text-foreground tracking-tight leading-none">
            {title}
          </h2>
          {description && (
            <p className="text-[12px] text-muted tracking-tight mt-1.5">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-muted tracking-tight mt-2 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

type InputProps = {
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  mono?: boolean
  className?: string
  min?: string
  max?: string
  step?: string
}

export function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  mono,
  className,
  ...rest
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors',
        mono && 'font-data',
        className
      )}
      {...rest}
    />
  )
}

export function SaveBar({
  feedback,
  errorMsg,
  onSave,
  pending,
  label = 'Salvar alteracoes',
}: {
  feedback: 'saved' | 'error' | null
  errorMsg?: string | null
  onSave: () => void
  pending: boolean
  label?: string
}) {
  return (
    <div className="py-10 border-t border-border flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        {feedback === 'error' && errorMsg && (
          <p className="text-[12px] text-destructive tracking-tight font-medium">{errorMsg}</p>
        )}
        {feedback === 'saved' && (
          <p className="text-[12px] text-success tracking-tight font-medium">
            Configuracoes salvas
          </p>
        )}
      </div>
      <button
        onClick={onSave}
        disabled={pending}
        className={cn(
          'h-9 px-4 text-[13px] font-medium rounded-md transition-colors disabled:opacity-40',
          'bg-primary text-primary-foreground hover:bg-primary-hover'
        )}
      >
        {pending ? 'Salvando' : label}
      </button>
    </div>
  )
}
