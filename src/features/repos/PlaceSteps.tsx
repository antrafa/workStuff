import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { tx } from '@/lib/i18n'
import { pathFromInput, pickFolder, type Source } from './api'
import type { Draft } from './SetupWizard'

type StepProps = { draft: Draft; patch: (p: Partial<Draft>) => void }

// Example that follows what the user types: real base and workspace, illustrative project.
function example(d: Draft) {
  const base = d.basePath || (d.provider === 'gitlab' ? tx({ en: 'my-company/area', pt: 'minha-empresa/area' }) : tx({ en: 'my-org', pt: 'minha-org' }))
  const rest = d.provider === 'gitlab' ? tx({ en: 'product/backend/api', pt: 'produto/backend/api' }) : tx({ en: 'my-repo', pt: 'meu-repo' })
  const ws = d.workspace.trim().replace(/\/+$/, '') || '~/workspace'
  return { remote: `${base}/${rest}`, local: `${ws}/${rest}` }
}

export function BaseStep({ draft, patch }: StepProps) {
  const ex = example(draft)
  // The field keeps the text as typed: stripping the host on every key would erase a half-typed URL.
  const [raw, setRaw] = useState(draft.basePath)
  return (
    <>
      <p className="wizard-why">
        {tx({
          en: <>The base group is the part of the path that does <b>not</b> become a folder. Everything below it is recreated in your workspace with the same hierarchy.</>,
          pt: <>O grupo base é a parte do caminho que <b>não</b> vira pasta. Tudo abaixo dele é recriado no seu workspace com a mesma hierarquia.</>,
        })}
      </p>
      <div className="callout callout-info" style={{ fontSize: 12.5, display: 'block' }}>
        {draft.provider === 'gitlab' ? tx({
          en: (
            <>
              Example: in <code className="inline">https://gitlab.com/my-company/area/product/backend</code>, if the base is{' '}
              <code className="inline">my-company/area</code>, the local folder is <code className="inline">workspace/product/backend</code>.
            </>
          ),
          pt: (
            <>
              Exemplo: em <code className="inline">https://gitlab.com/minha-empresa/area/produto/backend</code>, se a base é{' '}
              <code className="inline">minha-empresa/area</code>, a pasta local fica <code className="inline">workspace/produto/backend</code>.
            </>
          ),
        }) : tx({
          en: <>On GitHub the base is usually the organization or the user: <code className="inline">my-org/my-repo</code> becomes <code className="inline">workspace/my-repo</code>. Leave it empty to keep the organization as a folder.</>,
          pt: <>No GitHub, a base costuma ser a organização ou o usuário: <code className="inline">minha-org/meu-repo</code> vira <code className="inline">workspace/meu-repo</code>. Deixe vazio para manter a organização como pasta.</>,
        })}
      </div>
      <label className="field">
        <span>{draft.provider === 'gitlab' ? tx({ en: 'Base group', pt: 'Grupo base' }) : tx({ en: 'Organization or user', pt: 'Organização ou usuário' })}</span>
        <input
          className="input mono"
          value={raw}
          onChange={e => (setRaw(e.target.value), patch({ basePath: pathFromInput(e.target.value) }))}
          placeholder={draft.provider === 'gitlab' ? tx({ en: 'my-company/area (or paste the group URL)', pt: 'minha-empresa/area (ou cole a URL do grupo)' }) : tx({ en: 'my-org', pt: 'minha-org' })}
        />
        <small>
          {tx({
            en: 'You can paste the whole group URL; the site address is removed on its own. Browsing starts here.',
            pt: 'Pode colar a URL inteira do grupo; o endereço do site é removido sozinho. A navegação começa aqui.',
          })}
          {raw.trim() && raw.trim() !== draft.basePath && <> {tx({ en: 'Recognized base:', pt: 'Base reconhecida:' })} <code className="inline">{draft.basePath || tx({ en: '(root)', pt: '(raiz)' })}</code></>}
        </small>
      </label>
      <div className="preview mono">
        <span className="muted">{ex.remote}</span>
        <span>→ {ex.local}</span>
      </div>
    </>
  )
}

export function WorkspaceStep({ draft, patch }: StepProps) {
  const toast = useToast()
  const ex = example(draft)
  const browse = async () => {
    try {
      const { path } = await pickFolder()
      if (path) patch({ workspace: path })
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <>
      <p className="wizard-why">{tx({
        en: 'The folder where the clones are created. It is created if missing; nothing already there is overwritten.',
        pt: 'A pasta onde os clones são criados. Ela é criada se não existir; nada que já esteja lá é sobrescrito.',
      })}</p>
      <label className="field">
        <span>{tx({ en: 'Workspace folder', pt: 'Pasta do workspace' })}</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input mono" style={{ flex: 1 }} value={draft.workspace} onChange={e => patch({ workspace: e.target.value })} placeholder="~/workspace" />
          <button className="btn" onClick={browse} title={tx({ en: "Opens the system's folder picker", pt: 'Abre o seletor de pastas do sistema' })}><FolderOpen size={14} /> {tx({ en: 'Choose folder', pt: 'Selecionar pasta' })}</button>
        </div>
        <small>{tx({ en: 'Absolute path or starting with ~.', pt: 'Caminho absoluto ou começando com ~.' })}</small>
      </label>
      <div className="preview mono">
        <span className="muted">{tx({ en: `a project at ${ex.remote}`, pt: `um projeto em ${ex.remote}` })}</span>
        <span>{tx({ en: `goes to ${ex.local}`, pt: `vai para ${ex.local}` })}</span>
      </div>
    </>
  )
}

const TOKEN_LABEL = tx({
  en: { env: 'environment variable', gh: 'gh login', stored: 'pasted token', none: 'no token' },
  pt: { env: 'variável de ambiente', gh: 'login do gh', stored: 'token colado', none: 'sem token' },
})

export function NameStep({ draft, patch, editing }: StepProps & { editing: Source | null }) {
  const placeholder = `${draft.provider === 'gitlab' ? 'GitLab' : 'GitHub'}${draft.basePath ? ` · ${draft.basePath.split('/').pop()}` : ''}`
  const root = tx({ en: '(root)', pt: '(raiz)' })
  return (
    <>
      <p className="wizard-why">{tx({
        en: `Check before saving. Everything can be edited later${editing ? '' : " with the connection's Edit button"}.`,
        pt: `Confira antes de salvar. Dá para editar tudo depois${editing ? '' : ' pelo botão Editar da conexão'}.`,
      })}</p>
      <label className="field">
        <span>{tx({ en: 'Connection name', pt: 'Nome da conexão' })}</span>
        <input className="input" value={draft.label} onChange={e => patch({ label: e.target.value })} placeholder={placeholder} />
      </label>
      <dl className="kv">
        <dt>{tx({ en: 'Provider', pt: 'Provedor' })}</dt><dd>{draft.provider === 'gitlab' ? 'GitLab' : 'GitHub'} · {draft.url}</dd>
        <dt>Token</dt><dd>{TOKEN_LABEL[draft.tokenSource]}{draft.tokenSource === 'stored' && draft.keepToken ? tx({ en: ' (kept)', pt: ' (mantido)' }) : ''}</dd>
        <dt>{tx({ en: 'Protocol', pt: 'Protocolo' })}</dt><dd>{draft.protocol.toUpperCase()}</dd>
        <dt>{tx({ en: 'Base group', pt: 'Grupo base' })}</dt><dd>{draft.basePath || root}</dd>
        <dt>Workspace</dt><dd>{draft.workspace}</dd>
      </dl>
    </>
  )
}
