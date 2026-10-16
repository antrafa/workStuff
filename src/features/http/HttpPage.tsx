import './http.css'
import { ClipboardPaste, Copy, Plus, Save, Send, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Async, CopyButton, Empty, Modal, Page, Search, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import { formatJson } from '@/features/tools/text'
import { METHODS, fetchStore, saveStore, sendRequest, type HttpAnswer, type HttpEnvironment, type HttpStore, type SavedRequest } from './api'
import { applyVars, parseCurl, parseHeaderLines, parseVars, toCurl } from './requestText'

const ENV_KEY = 'http-environment'
const readEnv = () => {
  try {
    return localStorage.getItem(ENV_KEY) ?? ''
  } catch {
    return ''
  }
}

const newId = () => crypto.randomUUID()
const blank = (): SavedRequest => ({ id: newId(), name: '', group: '', method: 'GET', url: '', headers: '', body: '' })

export default function HttpPage() {
  const store = useAsync(fetchStore)
  return (
    <Page
      title={tx({ en: 'HTTP requests', pt: 'Requisições HTTP' })}
      hint={tx({
        en: 'Calls an endpoint and shows the answer, with saved requests, environments ({{variables}}) and curl in and out. The request leaves from the local server, so a tunnel on 127.0.0.1 works too.',
        pt: 'Chama um endpoint e mostra a resposta, com requisições salvas, ambientes ({{variáveis}}) e curl de ida e volta. A requisição sai do servidor local, então um túnel em 127.0.0.1 também funciona.',
      })}
    >
      <Async state={store} skeleton={<SkeletonRows rows={4} height={48} />}>
        {data => <Workbench initial={data} onSaved={store.setData} />}
      </Async>
    </Page>
  )
}

function Workbench({ initial, onSaved }: { initial: HttpStore; onSaved: (s: HttpStore) => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState<SavedRequest>(() => initial.requests[0] ?? blank())
  const [envId, setEnvId] = useState(readEnv)
  const [tab, setTab] = useState<'headers' | 'body'>('headers')
  const [answer, setAnswer] = useState<HttpAnswer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingEnvs, setEditingEnvs] = useState(false)

  const env = saved.environments.find(e => e.id === envId) ?? null
  const vars = useMemo(() => parseVars(env?.vars ?? ''), [env])
  const stored = saved.requests.find(r => r.id === draft.id)
  const changed = !stored || JSON.stringify(stored) !== JSON.stringify(draft)

  useEffect(() => {
    try {
      localStorage.setItem(ENV_KEY, envId)
    } catch {
      // no storage: the environment is picked again next time
    }
  }, [envId])

  // The request exactly as it leaves, with the environment's values in place
  const resolved = () => {
    const url = applyVars(draft.url, vars)
    const headers = parseHeaderLines(draft.headers).map(h => ({ name: h.name, ...applyVars(h.value, vars) }))
    const body = applyVars(draft.body, vars)
    const missing = [...new Set([...url.missing, ...headers.flatMap(h => h.missing), ...body.missing])]
    return { request: { method: draft.method, url: url.text, headers: headers.map(h => ({ name: h.name, value: h.text })), body: body.text }, missing }
  }

  const send = async () => {
    const { request, missing } = resolved()
    if (missing.length) {
      setError(tx({ en: `The environment has no value for: ${missing.join(', ')}`, pt: `O ambiente não tem valor para: ${missing.join(', ')}` }))
      return
    }
    setSending(true)
    setError(null)
    try {
      setAnswer(await sendRequest(request))
    } catch (e) {
      setAnswer(null)
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const persist = async (next: HttpStore, message: string) => {
    try {
      const done = await saveStore(next)
      setSaved(done)
      onSaved(done)
      toast(message)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const save = () => {
    const named = { ...draft, name: draft.name.trim() || draft.url.replace(/^https?:\/\/[^/]+/, '') || tx({ en: 'untitled', pt: 'sem nome' }) }
    setDraft(named)
    const requests = stored ? saved.requests.map(r => (r.id === named.id ? named : r)) : [...saved.requests, named]
    void persist({ ...saved, requests }, tx({ en: `Saved ${named.name}`, pt: `${named.name} salva` }))
  }

  const remove = () => {
    if (!stored) return setDraft(blank())
    void persist({ ...saved, requests: saved.requests.filter(r => r.id !== draft.id) }, tx({ en: `Removed ${stored.name}`, pt: `${stored.name} removida` }))
    setDraft(blank())
  }

  const field = <K extends keyof SavedRequest>(key: K, value: SavedRequest[K]) => setDraft(d => ({ ...d, [key]: value }))

  return (
    <div className="http-layout">
      <SavedList
        requests={saved.requests}
        current={draft.id}
        onPick={r => {
          setDraft(r)
          setAnswer(null)
          setError(null)
        }}
        onNew={() => {
          setDraft(blank())
          setAnswer(null)
          setError(null)
        }}
      />

      <div className="stack" style={{ minWidth: 0 }}>
        <section className="card card-pad stack">
          <form className="row http-line" onSubmit={e => (e.preventDefault(), send())}>
            <select className="select mono" value={draft.method} onChange={e => field('method', e.target.value)} aria-label={tx({ en: 'Method', pt: 'Método' })}>
              {METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
            <input className="input mono spacer" value={draft.url} onChange={e => field('url', e.target.value)} placeholder="{{base}}/api/health" aria-label="URL" />
            <button className="btn btn-primary" disabled={!draft.url.trim() || sending}><Send size={14} /> {sending ? tx({ en: 'Sending…', pt: 'Enviando…' }) : tx({ en: 'Send', pt: 'Enviar' })}</button>
          </form>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select className="select" value={envId} onChange={e => setEnvId(e.target.value)} aria-label={tx({ en: 'Environment', pt: 'Ambiente' })}>
              <option value="">{tx({ en: 'no environment', pt: 'sem ambiente' })}</option>
              {saved.environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => setEditingEnvs(true)}><Settings2 size={13} /> {tx({ en: 'Environments', pt: 'Ambientes' })}</button>
            <button className="btn btn-sm" onClick={() => setImporting(true)}><ClipboardPaste size={13} /> {tx({ en: 'Import curl', pt: 'Importar curl' })}</button>
            <CopyButton value={toCurl(resolved().request)} label={tx({ en: 'Copy as curl', pt: 'Copiar como curl' })} />
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 2, minWidth: 180 }} value={draft.name} onChange={e => field('name', e.target.value)} placeholder={tx({ en: 'Name (e.g. Order health)', pt: 'Nome (ex.: Saúde do pedidos)' })} />
            <input className="input" style={{ flex: 1, minWidth: 120 }} value={draft.group} onChange={e => field('group', e.target.value)} placeholder={tx({ en: 'Group (e.g. orders-api)', pt: 'Grupo (ex.: pedidos-api)' })} />
            <button className="btn" onClick={save} disabled={!changed}><Save size={14} /> {stored ? tx({ en: 'Save', pt: 'Salvar' }) : tx({ en: 'Save new', pt: 'Salvar nova' })}</button>
            {stored && <button className="btn" onClick={() => setDraft({ ...draft, id: newId(), name: `${draft.name} (2)` })}><Copy size={14} /> {tx({ en: 'Duplicate', pt: 'Duplicar' })}</button>}
            <button className="btn btn-ghost btn-icon" onClick={remove} title={stored ? tx({ en: 'Delete this request', pt: 'Excluir esta requisição' }) : tx({ en: 'Clear', pt: 'Limpar' })}><Trash2 size={14} /></button>
          </div>

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'headers'} onClick={() => setTab('headers')}>{tx({ en: 'Headers', pt: 'Cabeçalhos' })} ({parseHeaderLines(draft.headers).length})</button>
            <button role="tab" aria-selected={tab === 'body'} onClick={() => setTab('body')}>{tx({ en: 'Body', pt: 'Corpo' })}{draft.body ? ' •' : ''}</button>
          </div>
          {tab === 'headers' ? (
            <textarea className="textarea mono" rows={5} value={draft.headers} onChange={e => field('headers', e.target.value)} placeholder={'Authorization: Bearer {{token}}\nAccept: application/json\n# X-Desligado: 1'} />
          ) : (
            <textarea className="textarea mono" rows={8} value={draft.body} onChange={e => field('body', e.target.value)} placeholder={'{\n  "id": 1\n}'} />
          )}
          <small className="muted">
            {tx({
              en: 'One header per line as Name: value; a line starting with # is skipped. {{name}} takes the value from the chosen environment.',
              pt: 'Um cabeçalho por linha, no formato Nome: valor; linha que começa com # fica de fora. {{nome}} pega o valor do ambiente escolhido.',
            })}
          </small>
        </section>

        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {answer && <AnswerView answer={answer} />}
        {!answer && !error && (
          <div className="card">
            <Empty icon={Send} title={tx({ en: 'Send a request to see the answer', pt: 'Envie uma requisição para ver a resposta' })}>
              {tx({ en: 'Enter in the address field sends it too.', pt: 'Enter no campo do endereço também envia.' })}
            </Empty>
          </div>
        )}
      </div>

      {importing && (
        <ImportCurl
          onClose={() => setImporting(false)}
          onImport={parsed => {
            setDraft(d => ({ ...blank(), ...parsed, name: '', group: d.group }))
            setImporting(false)
            setAnswer(null)
          }}
        />
      )}
      {editingEnvs && (
        <EnvironmentsModal
          environments={saved.environments}
          onClose={() => setEditingEnvs(false)}
          onSave={environments => {
            void persist({ ...saved, environments }, tx({ en: 'Environments saved', pt: 'Ambientes salvos' }))
            if (!environments.some(e => e.id === envId)) setEnvId('')
            setEditingEnvs(false)
          }}
        />
      )}
    </div>
  )
}

function SavedList({ requests, current, onPick, onNew }: { requests: SavedRequest[]; current: string; onPick: (r: SavedRequest) => void; onNew: () => void }) {
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()
  const shown = requests.filter(r => `${r.name} ${r.group} ${r.url}`.toLowerCase().includes(q))
  const groups = [...new Set(shown.map(r => r.group))].sort((a, b) => a.localeCompare(b))
  return (
    <section className="card http-saved">
      <div className="card-head">
        <span className="card-title spacer">{tx({ en: 'Saved', pt: 'Salvas' })} ({requests.length})</span>
        <button className="btn btn-sm" onClick={onNew}><Plus size={13} /> {tx({ en: 'New', pt: 'Nova' })}</button>
      </div>
      <div className="card-pad stack" style={{ ['--gap' as string]: '10px' }}>
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter', pt: 'Filtrar' })} width={226} />
        {requests.length === 0 && <small className="muted">{tx({ en: 'Nothing saved yet. Type a request and click Save new.', pt: 'Nada salvo ainda. Monte uma requisição e clique em Salvar nova.' })}</small>}
        {groups.map(g => (
          <div key={g} className="stack" style={{ ['--gap' as string]: '2px' }}>
            {g && <span className="eyebrow">{g}</span>}
            {shown.filter(r => r.group === g).map(r => (
              <button key={r.id} className="http-saved-item" aria-pressed={r.id === current} onClick={() => onPick(r)} title={r.url}>
                <span className={`mono http-method http-method-${r.method.toLowerCase()}`}>{r.method}</span>
                <span className="http-saved-name">{r.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function statusClass(status: number) {
  if (status >= 500) return 'badge-crit'
  if (status >= 400) return 'badge-warn'
  if (status >= 300) return 'badge-info'
  return 'badge-ok'
}

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

function AnswerView({ answer }: { answer: HttpAnswer }) {
  const [showHeaders, setShowHeaders] = useState(false)
  const pretty = useMemo(() => {
    try {
      return formatJson(answer.body)
    } catch {
      return answer.body
    }
  }, [answer.body])
  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <span className={`badge ${statusClass(answer.status)} mono`}>{answer.status} {answer.statusText}</span>
        <span className="muted mono" style={{ fontSize: 12 }}>{answer.ms} ms · {size(answer.bytes)}</span>
        {answer.truncated && <span className="badge badge-warn">{tx({ en: 'cut at 5 MB', pt: 'cortada em 5 MB' })}</span>}
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setShowHeaders(s => !s)}>{showHeaders ? tx({ en: 'Hide headers', pt: 'Esconder cabeçalhos' }) : tx({ en: `Headers (${answer.headers.length})`, pt: `Cabeçalhos (${answer.headers.length})` })}</button>
        {!answer.binary && <CopyButton value={answer.body} label={tx({ en: 'Copy body', pt: 'Copiar corpo' })} />}
      </div>
      <div className="card-pad stack">
        {showHeaders && (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {answer.headers.map((h, i) => <tr key={i}><td className="mono" style={{ width: '30%' }}>{h.name}</td><td className="mono" style={{ overflowWrap: 'anywhere' }}>{h.value}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
        {answer.binary ? (
          <p className="muted" style={{ fontSize: 12.5 }}>{tx({ en: 'Binary answer (not text): the screen shows only its size and headers.', pt: 'Resposta binária (não é texto): a tela mostra só o tamanho e os cabeçalhos.' })}</p>
        ) : answer.body ? (
          <pre className="code http-body">{pretty}</pre>
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>{tx({ en: 'Empty body.', pt: 'Corpo vazio.' })}</p>
        )}
      </div>
    </section>
  )
}

function ImportCurl({ onClose, onImport }: { onClose: () => void; onImport: (r: Pick<SavedRequest, 'method' | 'url' | 'headers' | 'body'>) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const apply = () => {
    try {
      onImport(parseCurl(text))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Modal
      title={tx({ en: 'Import a curl command', pt: 'Importar um comando curl' })}
      width={720}
      onClose={onClose}
      footer={<button className="btn btn-primary" disabled={!text.trim()} onClick={apply}>{tx({ en: 'Import', pt: 'Importar' })}</button>}
    >
      <div className="stack">
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          {tx({
            en: 'Paste the command as it is, line breaks included. In the browser: DevTools, Network tab, right click on the request, Copy, Copy as cURL (bash).',
            pt: 'Cole o comando como está, com as quebras de linha. No navegador: DevTools, aba Network, botão direito na requisição, Copy, Copy as cURL (bash).',
          })}
        </p>
        <textarea className="textarea mono" rows={10} value={text} onChange={e => setText(e.target.value)} placeholder={"curl 'https://api.exemplo.com/v1/pedidos' \\\n  -H 'authorization: Bearer ...'"} autoFocus />
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </div>
    </Modal>
  )
}

function EnvironmentsModal({ environments, onClose, onSave }: { environments: HttpEnvironment[]; onClose: () => void; onSave: (e: HttpEnvironment[]) => void }) {
  const [list, setList] = useState(environments)
  const update = (id: string, patch: Partial<HttpEnvironment>) => setList(l => l.map(e => (e.id === id ? { ...e, ...patch } : e)))
  return (
    <Modal
      title={tx({ en: 'Environments', pt: 'Ambientes' })}
      width={760}
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={() => onSave(list)}><Save size={14} /> {tx({ en: 'Save', pt: 'Salvar' })}</button>}
    >
      <div className="stack">
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          {tx({
            en: 'One variable per line, as name=value. A request uses it as {{name}}. The values are saved in your data folder, readable only by you.',
            pt: 'Uma variável por linha, no formato nome=valor. A requisição usa como {{nome}}. Os valores ficam na sua pasta de dados, legíveis só por você.',
          })}
        </p>
        {list.map(e => (
          <div key={e.id} className="card card-pad stack" style={{ ['--gap' as string]: '8px' }}>
            <div className="row">
              <input className="input spacer" value={e.name} onChange={ev => update(e.id, { name: ev.target.value })} placeholder={tx({ en: 'Name (e.g. HML)', pt: 'Nome (ex.: HML)' })} />
              <button className="btn btn-ghost btn-icon" onClick={() => setList(l => l.filter(x => x.id !== e.id))} title={tx({ en: 'Remove environment', pt: 'Remover ambiente' })}><Trash2 size={14} /></button>
            </div>
            <textarea className="textarea mono" rows={4} value={e.vars} onChange={ev => update(e.id, { vars: ev.target.value })} placeholder={'base=http://127.0.0.1:8080\ntoken=...'} />
          </div>
        ))}
        <div><button className="btn" onClick={() => setList(l => [...l, { id: newId(), name: '', vars: '' }])}><Plus size={14} /> {tx({ en: 'New environment', pt: 'Novo ambiente' })}</button></div>
      </div>
    </Modal>
  )
}
