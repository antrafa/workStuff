import { Download, ExternalLink, FolderPlus, Loader2, Search as SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmModal, Empty, Modal, Search, useToast } from '@/ui'
import { installSkill, saveRoots, searchSkillsSh, type CliAgent, type SkillHit, type SkillSearch } from './api'
import { tx } from '@/lib/i18n'

const SUGGESTIONS = ['react', 'testing', 'kubernetes', 'design', 'git', 'documentation']
const AGENTS: { id: CliAgent; label: string }[] = [
  { id: 'claude-code', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'opencode', label: 'OpenCode' },
]
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}${tx({ en: 'k', pt: ' mil' })}` : String(n))

type Props = { roots: string[]; onInstalled: () => void; onClose: () => void }

export function SkillsShModal({ roots, onInstalled, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SkillSearch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [agents, setAgents] = useState<CliAgent[]>(['claude-code'])
  const [confirm, setConfirm] = useState<SkillHit | null>(null)
  const [run, setRun] = useState<{ hit: SkillHit; lines: string[]; done: boolean; ok: boolean } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const toast = useToast()
  useEffect(() => () => abort.current?.abort(), [])

  const runSearch = (q: string) => {
    setLoading(true)
    setError(null)
    searchSkillsSh(q).then(setResult).catch(e => setError((e as Error).message)).finally(() => setLoading(false))
  }

  // Debounced search: skills.sh is queried only when typing stops.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const t = setTimeout(() => runSearch(q), 400)
    return () => clearTimeout(t)
  }, [query])

  const command = (h: SkillHit) => `npx -y skills@1.7.0 add ${h.source} -g -s ${h.skillId} ${agents.map(a => `-a ${a}`).join(' ')} -y`

  const doInstall = async (hit: SkillHit) => {
    abort.current = new AbortController()
    setRun({ hit, lines: [], done: false, ok: false })
    let ok = false
    try {
      await installSkill({ source: hit.source, skillId: hit.skillId, agents }, e => {
        if (e.type === 'line') setRun(r => r && { ...r, lines: [...r.lines, e.text].slice(-300) })
        if (e.type === 'done') ok = e.ok
      }, abort.current.signal)
    } catch (e) {
      setRun(r => r && { ...r, lines: [...r.lines, `✗ ${(e as Error).message}`] })
    }
    setRun(r => r && { ...r, done: true, ok })
    if (ok) {
      toast(tx({ en: `${hit.name} installed`, pt: `${hit.name} instalada` }))
      if (query.trim().length >= 2) runSearch(query.trim())
      onInstalled()
    }
  }

  const addAgentsDir = async () => {
    if (!result) return
    try {
      await saveRoots([...roots, result.agentsDirPath])
      toast(tx({ en: `${result.agentsDir} added to the catalog folders`, pt: `${result.agentsDir} adicionada às pastas do catálogo` }))
      onInstalled()
      setResult({ ...result, inRoots: true })
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Modal title={tx({ en: 'Search skills on skills.sh', pt: 'Buscar skills no skills.sh' })} onClose={onClose} width={760}>
      <div className="stack">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {tx({
            en: <>Public skills catalog run by Vercel. Installing uses their official CLI at a pinned version: with one agent, the skill goes straight into its folder (e.g. <code className="inline">~/.claude/skills</code>); with several, it lives in <code className="inline">{result?.agentsDir ?? '~/.agents/skills'}</code> and is linked into each one.</>,
            pt: <>Catálogo público de skills mantido pela Vercel. A instalação usa o CLI oficial deles, numa versão fixa: com um agente só, a skill vai direto para a pasta dele (ex.: <code className="inline">~/.claude/skills</code>); com vários, fica em <code className="inline">{result?.agentsDir ?? '~/.agents/skills'}</code> e é ligada em cada um.</>,
          })}
        </p>
        <div className="row">
          <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Search skill (e.g. react, testing, kubernetes)…', pt: 'Buscar skill (ex.: react, testes, kubernetes)…' })} width={340} />
          {loading && <Loader2 size={15} className="spin" />}
        </div>
        <div className="row" style={{ ['--gap' as string]: '6px' }}>
          {SUGGESTIONS.map(s => <button key={s} className="chip" onClick={() => setQuery(s)}>{s}</button>)}
        </div>
        <div className="row" style={{ fontSize: 13 }}>
          <span className="muted">{tx({ en: 'Install for:', pt: 'Instalar para:' })}</span>
          {AGENTS.map(a => (
            <label key={a.id} className="row" style={{ ['--gap' as string]: '4px' }}>
              <input type="checkbox" checked={agents.includes(a.id)} onChange={e => setAgents(cur => (e.target.checked ? [...cur, a.id] : cur.filter(x => x !== a.id)))} />
              {a.label}
            </label>
          ))}
        </div>
        {result && !result.inRoots && (
          <div className="callout callout-info" style={{ fontSize: 12.5 }}>
            <FolderPlus size={15} />
            <span className="spacer">{tx({
              en: <>Skills installed for several agents live in <code className="inline">{result.agentsDir}</code>; add that folder so they show in the catalog.</>,
              pt: <>Skills instaladas para vários agentes ficam em <code className="inline">{result.agentsDir}</code>; adicione essa pasta para elas aparecerem no catálogo.</>,
            })}</span>
            <button className="btn btn-sm" onClick={addAgentsDir}>{tx({ en: `Add ${result.agentsDir} to the folders`, pt: `Adicionar ${result.agentsDir} às pastas` })}</button>
          </div>
        )}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}

        {run ? (
          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <div className="row">
              <b>{run.done ? (run.ok ? tx({ en: `✓ ${run.hit.name} installed`, pt: `✓ ${run.hit.name} instalada` }) : tx({ en: `✗ installing ${run.hit.name} failed`, pt: `✗ a instalação de ${run.hit.name} falhou` })) : tx({ en: `Installing ${run.hit.name}…`, pt: `Instalando ${run.hit.name}…` })}</b>
              <div className="spacer" />
              {!run.done && <button className="btn btn-sm" onClick={() => abort.current?.abort()}>{tx({ en: 'Stop', pt: 'Parar' })}</button>}
              {run.done && <button className="btn btn-sm" onClick={() => setRun(null)}>{tx({ en: 'Back to search', pt: 'Voltar à busca' })}</button>}
            </div>
            <pre className="code" style={{ maxHeight: 280, whiteSpace: 'pre-wrap', fontSize: 11.5 }}>{run.lines.join('\n') || tx({ en: 'starting the CLI…', pt: 'iniciando o CLI…' })}</pre>
          </div>
        ) : !result ? (
          <Empty icon={SearchIcon} title={tx({ en: 'Search for a skill', pt: 'Busque uma skill' })}>{tx({ en: 'Type at least 2 letters or pick a suggestion.', pt: 'Digite ao menos 2 letras ou escolha uma sugestão.' })}</Empty>
        ) : result.skills.length === 0 ? (
          <Empty icon={SearchIcon} title={tx({ en: 'Nothing found', pt: 'Nada encontrado' })}>{tx({ en: 'Try another term; English usually gets more results.', pt: 'Tente outro termo, em inglês costuma ter mais resultados.' })}</Empty>
        ) : (
          <div className="skills-sh-list">
            {result.skills.slice(0, 50).map(h => (
              <div key={h.id} className="skills-sh-row">
                <div className="spacer stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
                  <span className="row" style={{ ['--gap' as string]: '6px' }}>
                    <b>{h.name}</b>
                    {h.installed && <span className="badge badge-ok">{tx({ en: 'installed', pt: 'instalado' })}</span>}
                  </span>
                  <span className="muted mono" style={{ fontSize: 11.5 }}>{h.source} · {tx({ en: `${fmt(h.installs)} installs`, pt: `${fmt(h.installs)} instalações` })}</span>
                </div>
                <a className="btn btn-ghost btn-sm" href={`https://skills.sh/${h.id}`} target="_blank" rel="noreferrer" title={tx({ en: 'The skill\'s page on skills.sh', pt: 'Página da skill no skills.sh' })}><ExternalLink size={13} /> {tx({ en: 'view on skills.sh', pt: 'ver no skills.sh' })}</a>
                <a className="btn btn-ghost btn-sm" href={`https://github.com/${h.source}`} target="_blank" rel="noreferrer" title={tx({ en: 'Review the code before installing', pt: 'Revise o código antes de instalar' })}><ExternalLink size={13} /> {tx({ en: 'repository', pt: 'repositório' })}</a>
                <button className="btn btn-sm" disabled={!agents.length} onClick={() => setConfirm(h)} title={agents.length ? tx({ en: 'Installs with the skills.sh CLI', pt: 'Instala com o CLI do skills.sh' }) : tx({ en: 'Check at least one agent', pt: 'Marque ao menos um agente' })}>
                  <Download size={13} /> {h.installed ? tx({ en: 'Reinstall', pt: 'Reinstalar' }) : tx({ en: 'Install', pt: 'Instalar' })}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmModal title={tx({ en: `Install ${confirm.name}?`, pt: `Instalar ${confirm.name}?` })} confirmLabel={tx({ en: 'Install', pt: 'Instalar' })} icon={Download} onClose={() => setConfirm(null)} onConfirm={() => doInstall(confirm)}>
          <p style={{ margin: '0 0 10px' }}>{tx({ en: 'Runs on this machine:', pt: 'Roda nesta máquina:' })}</p>
          <code className="code" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{command(confirm)}</code>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {tx({
              en: <>
                <li>downloads the skill from <code className="inline">github.com/{confirm.source}</code>;</li>
                <li>installs it for {agents.map(a => AGENTS.find(x => x.id === a)?.label).join(', ')}{agents.length > 1 ? <> in <code className="inline">{result?.agentsDir ?? '~/.agents/skills'}</code>, with a link in each agent</> : ' straight into its skills folder'};</li>
                <li>the content is third-party and becomes instructions for the agent: review the repository first.</li>
              </>,
              pt: <>
                <li>baixa a skill de <code className="inline">github.com/{confirm.source}</code>;</li>
                <li>instala para {agents.map(a => AGENTS.find(x => x.id === a)?.label).join(', ')}{agents.length > 1 ? <> em <code className="inline">{result?.agentsDir ?? '~/.agents/skills'}</code>, com um link em cada agente</> : ' direto na pasta de skills dele'};</li>
                <li>o conteúdo é de terceiros e vira instrução para o agente: revise o repositório antes.</li>
              </>,
            })}
          </ul>
        </ConfirmModal>
      )}
    </Modal>
  )
}
