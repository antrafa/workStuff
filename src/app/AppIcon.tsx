// Marca do workStuff: prompt de terminal com cursor. Mesmo desenho do public/favicon.svg, mas nas cores
// da aplicação, para acompanhar a cor de destaque escolhida em Configurações.
export function AppIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--signal)" />
      <path d="M8.5 10.5 14 16l-5.5 5.5" fill="none" stroke="var(--signal-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 22h7" stroke="var(--signal-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
