import { CheckCircle2, ExternalLink, KeyRound, Loader2, PlugZap, Terminal, XCircle } from 'lucide-react'
import { useState } from 'react'
import { sshCheck, testConnection, type ProviderKind, type Source, type TokenSource } from './api'
import { toInput, type Draft } from './SetupWizard'

type StepProps = { draft: Draft; patch: (p: Partial<Draft>) => void }

const DEFAULT_URL: Record<ProviderKind, string> = { gitlab: 'https://gitlab.com', github: 'https://github.com' }

export function ProviderStep({ draft, patch }: StepProps) {
  const pick = (provider: ProviderKind) =>
    patch({ provider, url: DEFAULT_URL[provider], tokenSource: provider === 'gitlab' ? 'env' : 'none', basePath: '' })
  return (
    <>
      <p className="wizard-why">De onde vêm os repositórios. Funciona com o GitLab e o GitHub públicos e também com instalações próprias da empresa.</p>
      <div className="grid" style={{ ['--min' as string]: '220px' }}>
        {(['gitlab', 'github'] as ProviderKind[]).map(p => (
          <button key={p} className="choice" aria-pressed={draft.provider === p} onClick={() => pick(p)}>
            <b>{p === 'gitlab' ? 'GitLab' : 'GitHub'}</b>
            <small>{p === 'gitlab' ? 'Grupos e subgrupos viram pastas e subpastas' : 'Organização ou usuário; cada repositório vira uma pasta'}</small>
          </button>
        ))}
      </div>
      <label className="field">
        <span>Endereço</span>
        <input className="input mono" value={draft.url} onChange={e => patch({ url: e.target.value.trim() })} placeholder={DEFAULT_URL[draft.provider]} />
        <small>Troque só se for uma instalação própria (ex.: https://gitlab.suaempresa.com.br).</small>
      </label>
    </>
  )
}

type Hints = { GITLAB_TOKEN: boolean; GITHUB_TOKEN: boolean; gh: boolean } | null

const TOKEN_HELP: Record<ProviderKind, { url: string; scopes: string }> = {
  gitlab: { url: 'https://gitlab.com/-/user_settings/personal_access_tokens', scopes: 'read_api e read_repository' },
  github: { url: 'https://github.com/settings/tokens', scopes: 'repo e read:org' },
}

export function TokenStep({ draft, patch, hints, editing }: StepProps & { hints: Hints; editing: Source | null }) {
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const envVar = draft.provider === 'gitlab' ? 'GITLAB_TOKEN' : 'GITHUB_TOKEN'
  const help = TOKEN_HELP[draft.provider]
  const options: { id: TokenSource; label: string; detail: string; available: boolean }[] = [
    { id: 'env', label: `Usar ${envVar} do ambiente`, detail: hints?.[envVar] ? 'detectado no servidor: nada a digitar' : 'não definido no ambiente do servidor', available: Boolean(hints?.[envVar]) },
    ...(draft.provider === 'github' ? [{ id: 'gh' as TokenSource, label: 'Usar o login do gh', detail: hints?.gh ? 'gh auth está logado' : 'gh não está logado (rode gh auth login)', available: Boolean(hints?.gh) }] : []),
    { id: 'stored', label: 'Colar um token', detail: 'fica só nesta máquina, num arquivo que só você lê', available: true },
    { id: 'none', label: 'Sem token', detail: 'só o que é público; nada privado aparece', available: true },
  ]

  const run = async () => {
    setTest({ state: 'running', text: '' })
    try {
      const r = await testConnection({ ...toInput(draft), id: editing?.id })
      setTest({ state: 'ok', text: `Conectado como ${r.user}: ${r.groups} grupo(s) e ${r.projects} projeto(s) visíveis${draft.basePath ? ` em ${draft.basePath}` : ' na raiz'}.` })
    } catch (e) {
      setTest({ state: 'fail', text: (e as Error).message })
    }
  }

  return (
    <>
      <p className="wizard-why">O token deixa o painel listar os grupos e projetos privados a que você tem acesso. Ele nunca vai para o navegador.</p>
      <div className="stack" style={{ ['--gap' as string]: '8px' }}>
        {options.map(o => (
          <label key={o.id} className={`option ${o.available ? '' : 'is-off'}`} aria-checked={draft.tokenSource === o.id}>
            <input type="radio" name="token" checked={draft.tokenSource === o.id} disabled={!o.available} onChange={() => patch({ tokenSource: o.id })} />
            <span className="stack" style={{ ['--gap' as string]: '2px' }}>
              <b>{o.label}</b>
              <small className="muted">{o.detail}</small>
            </span>
          </label>
        ))}
      </div>
      {draft.tokenSource === 'stored' && (
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          {editing?.tokenSource === 'stored' && (
            <label className="row" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={draft.keepToken} onChange={e => patch({ keepToken: e.target.checked })} />
              Manter o token atual ({editing.token ?? 'ausente'})
            </label>
          )}
          {!draft.keepToken && (
            <label className="field">
              <span>Token</span>
              <input className="input mono" type="password" autoComplete="off" value={draft.token ?? ''} onChange={e => patch({ token: e.target.value })} placeholder={draft.provider === 'gitlab' ? 'glpat-…' : 'ghp_… ou github_pat_…'} />
              <small>
                Crie em <a href={help.url} target="_blank" rel="noreferrer">{help.url.replace('https://', '')} <ExternalLink size={11} /></a> com os escopos <b>{help.scopes}</b>.
              </small>
            </label>
          )}
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={run} disabled={test.state === 'running'} title="Confere endereço e token sem salvar nada">
          {test.state === 'running' ? <Loader2 size={14} className="spin" /> : <PlugZap size={14} />} Testar conexão
        </button>
        {test.state === 'ok' && <span className="test-ok"><CheckCircle2 size={14} /> {test.text}</span>}
        {test.state === 'fail' && <span className="test-fail"><XCircle size={14} /> {test.text}</span>}
      </div>
    </>
  )
}

export function ProtocolStep({ draft, patch }: StepProps) {
  const [check, setCheck] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const run = async () => {
    setCheck({ state: 'running', text: '' })
    try {
      const r = await sshCheck(draft.url)
      setCheck({ state: r.ok ? 'ok' : 'fail', text: r.detail || (r.ok ? 'chave aceita' : 'chave não aceita') })
    } catch (e) {
      setCheck({ state: 'fail', text: (e as Error).message })
    }
  }
  return (
    <>
      <p className="wizard-why">Como o git vai baixar o código. Os dois funcionam; a diferença aparece no dia a dia, no pull e no push.</p>
      <div className="grid" style={{ ['--min' as string]: '260px' }}>
        <button className="choice" aria-pressed={draft.protocol === 'ssh'} onClick={() => patch({ protocol: 'ssh' })}>
          <b><KeyRound size={14} /> SSH (recomendado)</b>
          <small>Usa a sua chave em ~/.ssh. Pull e push depois funcionam sem pedir nada. Precisa da chave cadastrada no {draft.provider === 'gitlab' ? 'GitLab' : 'GitHub'}.</small>
        </button>
        <button className="choice" aria-pressed={draft.protocol === 'https'} onClick={() => patch({ protocol: 'https' })}>
          <b><Terminal size={14} /> HTTPS</b>
          <small>Clona com o token, sem chave. O token não fica gravado no repositório: pull e push depois vão usar as credenciais do seu git.</small>
        </button>
      </div>
      {draft.protocol === 'ssh' ? (
        <div className="row">
          <button className="btn" onClick={run} disabled={check.state === 'running'} title={`Roda ssh -T git@${draft.url.replace(/^https:\/\//, '').split('/')[0]}`}>
            {check.state === 'running' ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />} Testar SSH
          </button>
          {check.state === 'ok' && <span className="test-ok"><CheckCircle2 size={14} /> {check.text}</span>}
          {check.state === 'fail' && <span className="test-fail"><XCircle size={14} /> {check.text}. Cadastre sua chave pública no provedor ou escolha HTTPS.</span>}
        </div>
      ) : (
        <div className="callout callout-info" style={{ fontSize: 12.5 }}>
          <KeyRound size={15} />
          <span>Depois do clone, o remote fica sem token. Para pull/push por HTTPS, configure um credential helper no seu git (ou use SSH).</span>
        </div>
      )}
    </>
  )
}
