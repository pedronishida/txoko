'use client'

import { Toaster as SonnerToaster } from 'sonner'
import type { ComponentProps } from 'react'

export { toast } from 'sonner'

export function Toaster(props: ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="top-right"
      gap={8}
      offset={20}
      visibleToasts={4}
      closeButton
      richColors={false}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            '!bg-bg-elevated !text-foreground !border !border-[var(--border)] !rounded-lg !text-[13px]',
          title: '!text-foreground !font-semibold',
          description: '!text-muted',
          actionButton:
            '!bg-primary !text-primary-foreground !text-[12px] !font-semibold !rounded-md !px-2.5 !py-1',
          cancelButton: '!bg-transparent !text-muted !text-[12px]',
          closeButton:
            '!bg-transparent !text-muted hover:!text-foreground !border-0',
          success: '!bg-success/10 !text-success !border-success/20',
          error: '!bg-destructive/10 !text-destructive !border-destructive/20',
          warning: '!bg-warning/10 !text-warning !border-warning/20',
          info: '!bg-primary/10 !text-primary !border-primary/20',
        },
      }}
      {...props}
    />
  )
}
