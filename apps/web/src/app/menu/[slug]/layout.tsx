export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light min-h-screen bg-bg text-foreground">
      {children}
    </div>
  )
}
