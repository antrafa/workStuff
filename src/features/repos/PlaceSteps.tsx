import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { pathFromInput, pickFolder, type Source } from './api'
import type { Draft } from './SetupWizard'

type StepProps = { draft: Draft; patch: (p: Partial<Draft>) => void }

// Exemplo que acompanha o que o usuário digita: base e workspace reais, projeto ilustrativo.
function example(d: Draft) {
  const base = d.basePath || (d.provider === 'gitlab' ? 'minha-empresa/area' : 'minha-org')
  const rest = d.provider === 'gitlab' ? 'produto/backend/api' : 'meu-repo'
  const ws = d.workspace.trim().replace(/\/+$/, '') || '~/workspace'
  return { remote: `${base}/${rest}`, local: `${ws}/${rest}` }
}

export function BaseStep({ draft, patch }: StepProps) {
  const ex = example(draft)
  // O campo guarda o texto como digitado: tirar o host a cada tecla apagaria uma URL ainda pela metade.
  const [raw, setRaw] = useState(draft.basePath)
  return (
    <>
      <p className="wizard-why">
        O grupo base é a parte do caminho que <b>não</b> vira pasta. Tudo abaixo dele é recriado no seu workspace com a mesma hierarquia.
      </p>
      <div className="callout callout-info" style={{ fontSize: 12.5, display: 'block' }}>
        {draft.provider === 'gitlab' ? (
          <>
            Exemplo: em <code className="inline">https://gitlab.com/minha-empresa/area/produto/backend</code>, se a base é{' '}
            <code className="inline">minha-empresa/area</code>, a pasta local fica <code className="inline">workspace/produto/backend</code>.
          </>
        ) : (
          <>No GitHub, a base costuma ser a organização ou o usuário: <code className="inline">minha-org/meu-repo</code> vira <code className="inline">workspace/meu-repo</code>. Deixe vazio para manter a organização como pasta.</>
        )}
      </div>
      <label className="field">
        <span>{draft.provider === 'gitlab' ? 'Grupo base' : 'Organização ou usuário'}</span>
        <input
          className="input mono"
          value={raw}
          onChange={e => (setRaw(e.target.value), patch({ basePath: pathFromInput(e.target.value) }))}
          placeholder={draft.provider === 'gitlab' ? 'minha-empresa/area (ou cole a URL do grupo)' : 'minha-org'}
        />
        <small>
          Pode colar a URL inteira do grupo; o endereço do site é removido sozinho. A navegação começa aqui.
          {raw.trim() && raw.trim() !== draft.basePath && <> Base reconhecida: <code className="inline">{draft.basePath || '(raiz)'}</code></>}
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
      <p className="wizard-why">A pasta onde os clones são criados. Ela é criada se não existir; nada que já esteja lá é sobrescrito.</p>
      <label className="field">
        <span>Pasta do workspace</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input mono" style={{ flex: 1 }} value={draft.workspace} onChange={e => patch({ workspace: e.target.value })} placeholder="~/workspace" />
          <button className="btn" onClick={browse} title="Abre o seletor de pastas do sistema"><FolderOpen size={14} /> Selecionar pasta</button>
        </div>
        <small>Caminho absoluto ou começando com ~.</small>
      </label>
      <div className="preview mono">
        <span className="muted">um projeto em {ex.remote}</span>
        <span>vai para {ex.local}</span>
      </div>
    </>
  )
}

const TOKEN_LABEL = { env: 'variável de ambiente', gh: 'login do gh', stored: 'token colado', none: 'sem token' }

export function NameStep({ draft, patch, editing }: StepProps & { editing: Source | null }) {
  const placeholder = `${draft.provider === 'gitlab' ? 'GitLab' : 'GitHub'}${draft.basePath ? ` · ${draft.basePath.split('/').pop()}` : ''}`
  return (
    <>
      <p className="wizard-why">Confira antes de salvar. Dá para editar tudo depois{editing ? '' : ' pelo botão Editar da conexão'}.</p>
      <label className="field">
        <span>Nome da conexão</span>
        <input className="input" value={draft.label} onChange={e => patch({ label: e.target.value })} placeholder={placeholder} />
      </label>
      <dl className="kv">
        <dt>Provedor</dt><dd>{draft.provider === 'gitlab' ? 'GitLab' : 'GitHub'} · {draft.url}</dd>
        <dt>Token</dt><dd>{TOKEN_LABEL[draft.tokenSource]}{draft.tokenSource === 'stored' && draft.keepToken ? ' (mantido)' : ''}</dd>
        <dt>Protocolo</dt><dd>{draft.protocol.toUpperCase()}</dd>
        <dt>Grupo base</dt><dd>{draft.basePath || '(raiz)'}</dd>
        <dt>Workspace</dt><dd>{draft.workspace}</dd>
      </dl>
    </>
  )
}
