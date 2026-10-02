// Carimbo do ambiente: a forma cresce com o risco (contorno fino, tracejado, grosso, invertido),
// sem cor, para não brigar com o destaque nem com os estados.
const TITLE: Record<string, string> = {
  LOCAL: 'Esta máquina: ferramentas e IA',
  DES: 'Desenvolvimento: ações com confirmação',
  ITG: 'Integração: ações com confirmação',
  HML: 'Homologação: ações com confirmação e o comando à vista',
  PRO: 'Produção: somente leitura',
}

export function EnvStamp({ env, large }: { env: string | null; large?: boolean }) {
  const name = env ?? 'sem ambiente'
  return (
    <span className={`env-stamp env-${env ?? 'none'} ${large ? 'env-stamp-lg' : ''}`} title={env ? TITLE[env] : 'Sem classificação vale como PRO: somente leitura'}>
      {name}
    </span>
  )
}
