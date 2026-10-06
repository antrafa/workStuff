import { tx } from '@/lib/i18n'

// Environment stamp: the shape grows with the risk (thin outline, dashed, thick, inverted),
// with no color, so it does not fight the accent or the states.
const TITLE: Record<string, string> = {
  LOCAL: tx({ en: 'This machine: tools and AI', pt: 'Esta máquina: ferramentas e IA' }),
  DES: tx({ en: 'Development: actions ask for confirmation', pt: 'Desenvolvimento: ações com confirmação' }),
  ITG: tx({ en: 'Integration: actions ask for confirmation', pt: 'Integração: ações com confirmação' }),
  HML: tx({ en: 'Staging: actions ask for confirmation, with the command shown', pt: 'Homologação: ações com confirmação e o comando à vista' }),
  PRO: tx({ en: 'Production: read-only', pt: 'Produção: somente leitura' }),
}

export function EnvStamp({ env, large }: { env: string | null; large?: boolean }) {
  const name = env ?? tx({ en: 'no environment', pt: 'sem ambiente' })
  return (
    <span className={`env-stamp env-${env ?? 'none'} ${large ? 'env-stamp-lg' : ''}`} title={env ? TITLE[env] : tx({ en: 'Unclassified counts as PRO: read-only', pt: 'Sem classificação vale como PRO: somente leitura' })}>
      {name}
    </span>
  )
}
