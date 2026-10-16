import {
  Archive, Code, FolderGit2, GitBranch, GitPullRequest, HardDrive, RefreshCw, Scissors, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Async, ConfirmModal, Empty, Search, Segmented, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { locale, tx } from '@/lib/i18n'
import {
  cleanWorkspaceArtifacts,
  fetchGitWorkspaceRepo,
  fetchWorkspace,
  openWorkspaceRepo,
  pruneWorkspaceBranches,
  type WorkspaceRepo,
} from './api'

type FilterKind = 'all' | 'dirty' | 'stash' | 'sync' | 'artifacts'
const FILTER_KINDS: FilterKind[] = ['all', 'dirty', 'stash', 'sync', 'artifacts']

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let val = bytes
  let u = 0
  while (val >= 1024 && u < units.length - 1) {
    val /= 1024
    u++
  }
  return `${val >= 10 || u === 0 ? Math.round(val) : val.toFixed(1)} ${units[u]}`
}

export function WorkspaceRadar() {
  const state = useAsync(fetchWorkspace)
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  // Search and filter live in the URL, so coming back from the review restores the same list
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const filterParam = searchParams.get('filtro') as FilterKind | null
  const filter: FilterKind = filterParam && FILTER_KINDS.includes(filterParam) ? filterParam : 'all'
  const setParam = (key: string, value: string) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  const setQuery = (v: string) => setParam('q', v)
  const setFilter = (v: FilterKind) => setParam('filtro', v === 'all' ? '' : v)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [pruning, setPruning] = useState<WorkspaceRepo | null>(null)
  const [cleaning, setCleaning] = useState<WorkspaceRepo | null>(null)

  const openEditor = async (r: WorkspaceRepo) => {
    try {
      await openWorkspaceRepo(r.path)
      toast(tx({ en: `Opened ${r.name} in editor`, pt: `${r.name} aberto no editor` }))
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const runFetch = async (r: WorkspaceRepo) => {
    setBusyPath(r.path)
    try {
      await fetchGitWorkspaceRepo(r.path)
      toast(tx({ en: `git fetch completed in ${r.name}`, pt: `git fetch concluído em ${r.name}` }))
      state.reload()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusyPath(null)
    }
  }

  const confirmPrune = async (r: WorkspaceRepo) => {
    setBusyPath(r.path)
    try {
      const res = await pruneWorkspaceBranches(r.path)
      toast(tx({
        en: `${res.deleted.length} merged branch(es) removed from ${r.name}`,
        pt: `${res.deleted.length} branch(es) mergeada(s) removida(s) de ${r.name}`,
      }))
      state.reload()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusyPath(null)
    }
  }

  const confirmClean = async (r: WorkspaceRepo) => {
    setBusyPath(r.path)
    try {
      const res = await cleanWorkspaceArtifacts(r.path, r.artifactDirs)
      toast(tx({
        en: `Freed ${res.freedPartial ? '≥ ' : ''}${formatBytes(res.freedBytes)} in ${r.name} (${res.cleaned.join(', ')})`,
        pt: `Liberados ${res.freedPartial ? '≥ ' : ''}${formatBytes(res.freedBytes)} em ${r.name} (${res.cleaned.join(', ')})`,
      }))
      state.reload()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusyPath(null)
    }
  }

  return (
    <Async state={state} skeleton={<SkeletonRows rows={5} height={44} />}>
      {scan => {
        const all = scan.repos
        const dirtyTotal = all.filter(r => r.dirtyCount > 0).length
        const stashTotal = all.reduce((s, r) => s + r.stashCount, 0)
        const syncTotal = all.filter(r => r.ahead > 0 || r.behind > 0).length
        const artifactBytesTotal = all.reduce((s, r) => s + r.artifactBytes, 0)
        const artifactPartialAny = all.some(r => r.artifactPartial)

        const q = query.trim().toLowerCase()
        const filtered = all.filter(r => {
          if (q && !r.name.toLowerCase().includes(q) && !r.relPath.toLowerCase().includes(q) && !r.branch.toLowerCase().includes(q)) {
            return false
          }
          if (filter === 'dirty') return r.dirtyCount > 0
          if (filter === 'stash') return r.stashCount > 0
          if (filter === 'sync') return r.ahead > 0 || r.behind > 0
          if (filter === 'artifacts') return r.artifactBytes > 0
          return true
        })

        return (
          <div className="stack">
            <div className="grid" style={{ ['--min' as string]: '180px' }}>
              <div className="stat">
                <span className="eyebrow">{tx({ en: 'Cloned repositories', pt: 'Repositórios clonados' })}</span>
                <b>{all.length}</b>
                <small className="muted">
                  {scan.workspaces.map(w => w.label).join(', ') || tx({ en: 'No workspace configured', pt: 'Nenhum workspace configurado' })}
                </small>
              </div>
              <div className="stat">
                <span className="eyebrow">{tx({ en: 'Uncommitted work', pt: 'Alterações não commitadas' })}</span>
                <b style={{ color: dirtyTotal > 0 ? 'var(--warn)' : 'var(--ok)' }}>{dirtyTotal}</b>
                <small className="muted">{tx({ en: 'repositories with dirty working tree', pt: 'repositórios com arquivos modificados' })}</small>
              </div>
              <div className="stat">
                <span className="eyebrow">{tx({ en: 'Saved stashes', pt: 'Stashes salvos' })}</span>
                <b style={{ color: stashTotal > 0 ? 'var(--info)' : 'var(--ink)' }}>{stashTotal}</b>
                <small className="muted">{tx({ en: 'across all local clones', pt: 'em todos os clones locais' })}</small>
              </div>
              <div className="stat">
                <span className="eyebrow">{tx({ en: 'Build artifacts on disk', pt: 'Artefatos de build no disco' })}</span>
                <b>{artifactPartialAny ? '≥ ' : ''}{formatBytes(artifactBytesTotal)}</b>
                <small className="muted">target/, node_modules/, dist/, build/</small>
              </div>
            </div>

            <section className="card">
              <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
                <FolderGit2 size={16} color="var(--signal)" />
                <div className="card-title">{tx({ en: 'Local Workspace Radar', pt: 'Radar do Workspace Local' })}</div>
                <div className="spacer" />
                <Segmented<FilterKind>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: 'all', label: `${tx({ en: 'All', pt: 'Todos' })} (${all.length})` },
                    { id: 'dirty', label: `${tx({ en: 'Dirty', pt: 'Modificados' })} (${dirtyTotal})` },
                    { id: 'stash', label: `Stash (${stashTotal})` },
                    { id: 'sync', label: `${tx({ en: 'Out of sync', pt: 'Atrasados/À frente' })} (${syncTotal})` },
                    { id: 'artifacts', label: `${tx({ en: 'Artifacts', pt: 'Artefatos' })}` },
                  ]}
                />
                <Search
                  width={220}
                  value={query}
                  onChange={setQuery}
                  placeholder={tx({ en: 'Filter by repo or branch…', pt: 'Filtrar por repo ou branch…' })}
                />
                <button className="btn btn-sm" onClick={state.reload}>
                  <RefreshCw size={13} className={state.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="card-pad">
                  <Empty
                    icon={FolderGit2}
                    title={all.length === 0
                      ? tx({ en: 'No local git repository found in the configured workspaces', pt: 'Nenhum repositório git local encontrado nos workspaces configurados' })
                      : tx({ en: 'No repository matches this filter', pt: 'Nenhum repositório corresponde a este filtro' })}
                  />
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{tx({ en: 'Repository', pt: 'Repositório' })}</th>
                        <th>Branch</th>
                        <th>{tx({ en: 'Working tree', pt: 'Estado local' })}</th>
                        <th>{tx({ en: 'Last commit', pt: 'Último commit' })}</th>
                        <th className="num">{tx({ en: 'Build artifacts', pt: 'Artefatos' })}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr key={r.path}>
                          <td>
                            <b>{r.name}</b>
                            <div className="muted mono" style={{ fontSize: 11.5 }}>{r.workspaceLabel}/{r.relPath}</div>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              <span className="badge mono"><GitBranch size={11} /> {r.branch}</span>
                              {r.ahead > 0 && <span className="badge badge-info mono" title={tx({ en: `${r.ahead} commit(s) ahead of ${r.compareRef}`, pt: `${r.ahead} commit(s) à frente de ${r.compareRef}` })}>↑{r.ahead}</span>}
                              {r.behind > 0 && <span className="badge badge-warn mono" title={tx({ en: `${r.behind} commit(s) behind ${r.compareRef}`, pt: `${r.behind} commit(s) atrás de ${r.compareRef}` })}>↓{r.behind}</span>}
                            </div>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              {r.dirtyCount > 0 ? (
                                <span className="badge badge-warn">● {r.dirtyCount} {tx({ en: 'modified', pt: 'modificado(s)' })}</span>
                              ) : (
                                <span className="badge badge-ok">✓ {tx({ en: 'clean', pt: 'limpo' })}</span>
                              )}
                              {r.stashCount > 0 && (
                                <span className="badge badge-info"><Archive size={11} /> {r.stashCount} stash</span>
                              )}
                              {r.mergedBranches.length > 0 && (
                                <span className="badge" title={r.mergedBranches.join(', ')}>
                                  {r.mergedBranches.length} {tx({ en: 'merged', pt: 'mergeada(s)' })}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {r.lastCommitSubject ? (
                              <div className="stack" style={{ ['--gap' as string]: '2px' }}>
                                <span style={{ fontSize: 12.5 }}>{r.lastCommitSubject.slice(0, 60)}</span>
                                {r.lastCommitAt && (
                                  <small className="muted mono" style={{ fontSize: 11 }}>
                                    {new Date(r.lastCommitAt).toLocaleDateString(locale())}
                                  </small>
                                )}
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="num mono">
                            {r.artifactBytes > 0 ? (
                              <span title={r.artifactDirs.join(', ')}>
                                {r.artifactPartial ? '≥ ' : ''}{formatBytes(r.artifactBytes)} <small className="muted">({r.artifactDirs.join(', ')})</small>
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <button
                                className="btn btn-sm"
                                onClick={() => openEditor(r)}
                                title={tx({ en: 'Open folder in VS Code or system file manager', pt: 'Abrir pasta no VS Code ou gerenciador de arquivos' })}
                              >
                                <Code size={12} /> {tx({ en: 'Editor', pt: 'Editor' })}
                              </button>
                              <button
                                className="btn btn-sm"
                                onClick={() => navigate(`/revisao?repo=${encodeURIComponent(r.path)}`, { state: { from: location.pathname + location.search } })}
                                title={tx({ en: 'Inspect Cognitive Diff and Blast Radius on the Review screen', pt: 'Inspecionar Diff Cognitivo e Raio de Impacto na tela de Revisão' })}
                              >
                                <GitPullRequest size={12} /> {tx({ en: 'Review', pt: 'Revisar' })}
                              </button>
                              <button
                                className="btn btn-sm"
                                disabled={busyPath === r.path}
                                onClick={() => runFetch(r)}
                                title="git fetch --prune"
                              >
                                <RefreshCw size={12} className={busyPath === r.path ? 'spin' : ''} /> Fetch
                              </button>
                              {r.mergedBranches.length > 0 && (
                                <button
                                  className="btn btn-ghost btn-sm btn-icon"
                                  disabled={busyPath === r.path}
                                  onClick={() => setPruning(r)}
                                  title={tx({
                                    en: `Delete ${r.mergedBranches.length} merged local branch(es): ${r.mergedBranches.join(', ')}`,
                                    pt: `Apagar ${r.mergedBranches.length} branch(es) local(is) já mergeada(s): ${r.mergedBranches.join(', ')}`,
                                  })}
                                >
                                  <Scissors size={13} />
                                </button>
                              )}
                              {r.artifactBytes > 0 && (
                                <button
                                  className="btn btn-ghost btn-sm btn-icon"
                                  disabled={busyPath === r.path}
                                  onClick={() => setCleaning(r)}
                                  title={tx({
                                    en: `Clean build artifacts (${r.artifactDirs.join(', ')}) — ${formatBytes(r.artifactBytes)}`,
                                    pt: `Limpar artefatos de build (${r.artifactDirs.join(', ')}) — ${formatBytes(r.artifactBytes)}`,
                                  })}
                                >
                                  <HardDrive size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {pruning && (
              <ConfirmModal
                title={tx({ en: `Remove merged local branches in ${pruning.name}?`, pt: `Remover branches locais já mergeadas em ${pruning.name}?` })}
                action={tx({ en: 'prune merged branches', pt: 'limpar branches mergeadas' })}
                env="LOCAL"
                command={`git -C "${pruning.path}" branch -d ${pruning.mergedBranches.join(' ')}`}
                effects={[
                  tx({
                    en: `Deletes ${pruning.mergedBranches.length} local branch(es) already merged into the current branch: ${pruning.mergedBranches.join(', ')}`,
                    pt: `Remove ${pruning.mergedBranches.length} branch(es) local(is) já integrada(s) na branch atual: ${pruning.mergedBranches.join(', ')}`,
                  }),
                ]}
                losses={[
                  tx({
                    en: 'Only the local branch pointers; commits are already in the base branch and remote branches are untouched',
                    pt: 'Apenas os ponteiros de branch locais; os commits já estão na branch atual e as branches remotas não são tocadas',
                  }),
                ]}
                confirmLabel={tx({ en: 'Delete branches', pt: 'Apagar branches' })}
                icon={Scissors}
                onClose={() => setPruning(null)}
                onConfirm={() => confirmPrune(pruning)}
              />
            )}

            {cleaning && (
              <ConfirmModal
                title={tx({ en: `Clean build artifacts in ${cleaning.name}?`, pt: `Limpar artefatos de build em ${cleaning.name}?` })}
                action={tx({ en: 'clean build artifacts', pt: 'limpar artefatos de build' })}
                env="LOCAL"
                effects={[
                  tx({
                    en: `Removes ${cleaning.artifactDirs.join(', ')} inside ${cleaning.name}, freeing ~${formatBytes(cleaning.artifactBytes)}`,
                    pt: `Remove ${cleaning.artifactDirs.join(', ')} dentro de ${cleaning.name}, liberando ~${formatBytes(cleaning.artifactBytes)}`,
                  }),
                ]}
                losses={[
                  tx({
                    en: 'Compiled build output and installed dependencies; you will need to run mvn/npm install again when working on this project',
                    pt: 'Arquivos compilados e dependências instaladas; será necessário rodar mvn/npm install novamente quando voltar a trabalhar neste projeto',
                  }),
                ]}
                confirmLabel={tx({ en: 'Clean artifacts', pt: 'Limpar artefatos' })}
                icon={Trash2}
                onClose={() => setCleaning(null)}
                onConfirm={() => confirmClean(cleaning)}
              />
            )}
          </div>
        )
      }}
    </Async>
  )
}
