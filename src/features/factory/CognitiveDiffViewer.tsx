// Reorganização Cognitiva do Diff (inspirado no pr-review-canvas).
// Agrupa arquivos por lógica de negócio (core), amarração de API/rotas (wiring),
// testes e docs/meta, exibe o blast radius diretamente no arquivo afetado e
// permite colapsar/expandir e filtrar por categoria ou busca de texto.

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Zap,
} from 'lucide-react'
import type { BlastRadiusReport, DiffStat } from '../../../server/lib/factory/types.ts'
import {
  CATEGORY_INFO,
  CATEGORY_ORDER,
  groupDiffByCategory,
  parseUnifiedDiff,
  type DiffCategory,
} from './diffReview.ts'
import { tx } from '@/lib/i18n'

type Props = {
  diffContent?: string
  diffStat?: DiffStat
  blastRadius?: BlastRadiusReport
}

export function CognitiveDiffViewer({ diffContent, diffStat, blastRadius }: Props) {
  const files = useMemo(() => parseUnifiedDiff(diffContent || ''), [diffContent])
  const grouped = useMemo(() => groupDiffByCategory(files), [files])

  // Lookup map for blast radius by file path
  const blastMap = useMemo(() => {
    const map = new Map<string, BlastRadiusReport['files'][0]>()
    for (const f of blastRadius?.files ?? []) {
      map.set(f.file, f)
    }
    return map
  }, [blastRadius])

  const [categoryFilter, setCategoryFilter] = useState<'all' | DiffCategory>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Paths currently expanded in the accordion
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // By default: expand up to 4 files, prioritizing core domain logic
    const initial = new Set<string>()
    if (files.length <= 4) {
      for (const f of files) initial.add(f.path)
    } else {
      for (const f of grouped.core) initial.add(f.path)
      // If no core files, expand the first 2
      if (initial.size === 0) {
        for (const f of files.slice(0, 2)) initial.add(f.path)
      }
    }
    return initial
  })

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const expandAll = () => {
    setExpandedPaths(new Set(files.map(f => f.path)))
  }

  const collapseAll = () => {
    setExpandedPaths(new Set())
  }

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        if (!f.path.toLowerCase().includes(term)) return false
      }
      return true
    })
  }, [files, categoryFilter, searchTerm])

  if (!diffContent || files.length === 0) {
    return (
      <div className="card card-pad muted" style={{ textAlign: 'center', padding: '24px 16px' }}>
        {tx({
          en: 'No difference found against the base branch.',
          pt: 'Nenhuma diferença identificada contra a branch base.',
        })}
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {/* 1. Header with Stats & Blast Radius notice */}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="row" style={{ fontSize: 12, color: 'var(--muted)', gap: 8 }}>
            <span>
              {tx({
                en: `${diffStat?.filesChanged ?? files.length} files changed`,
                pt: `${diffStat?.filesChanged ?? files.length} arquivos alterados`,
              })}
            </span>
            <span>·</span>
            <span style={{ color: 'var(--ok)' }}>
              +{diffStat?.insertions ?? files.reduce((acc, f) => acc + f.insertions, 0)}{' '}
              {tx({ en: 'additions', pt: 'adições' })}
            </span>
            <span>·</span>
            <span style={{ color: 'var(--crit)' }}>
              -{diffStat?.deletions ?? files.reduce((acc, f) => acc + f.deletions, 0)}{' '}
              {tx({ en: 'deletions', pt: 'remoções' })}
            </span>
          </div>

          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={expandAll}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              {tx({ en: 'Expand all', pt: 'Expandir todos' })}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={collapseAll}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              {tx({ en: 'Collapse all', pt: 'Recolher todos' })}
            </button>
          </div>
        </div>

        {/* Blast Radius notice if dependents exist */}
        {blastRadius && blastRadius.totalDependents > 0 && (
          <div
            className="callout callout-warn row"
            style={{ alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12 }}
          >
            <Zap size={14} style={{ color: 'var(--warn)', flexShrink: 0 }} />
            <span>
              <b>{tx({ en: 'Blast Radius:', pt: 'Raio de Impacto:' })}</b>{' '}
              {tx({
                en: `${blastRadius.totalDependents} outside modules import code changed in this task across ${blastRadius.files.length} file(s).`,
                pt: `${blastRadius.totalDependents} módulos externos importam código alterado nesta tarefa em ${blastRadius.files.length} arquivo(s).`,
              })}
            </span>
          </div>
        )}
      </div>

      {/* 2. Cognitive Category Filters & Search */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="chip"
            aria-pressed={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          >
            {tx({ en: 'All', pt: 'Todos' })}
            <span className="count">{files.length}</span>
          </button>

          {CATEGORY_ORDER.map(cat => {
            const count = grouped[cat].length
            if (count === 0) return null
            const info = CATEGORY_INFO[cat]
            return (
              <button
                key={cat}
                type="button"
                className="chip"
                aria-pressed={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                title={tx(info.hint)}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: info.colorToken,
                    marginRight: 4,
                  }}
                />
                {tx(info.label)}
                <span className="count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="row" style={{ position: 'relative', minWidth: 180, flex: '1 1 180px', maxWidth: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: 26, fontSize: 12, paddingBlock: 4, width: '100%' }}
            placeholder={tx({ en: 'Filter file...', pt: 'Filtrar arquivo...' })}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* 3. File List (Cognitive Accordion) */}
      <div className="stack" style={{ gap: 8 }}>
        {filteredFiles.length === 0 ? (
          <div className="card card-pad muted" style={{ textAlign: 'center', fontSize: 12 }}>
            {tx({ en: 'No files match the active filter.', pt: 'Nenhum arquivo corresponde ao filtro ativo.' })}
          </div>
        ) : (
          filteredFiles.map(file => {
            const isExpanded = expandedPaths.has(file.path)
            const info = CATEGORY_INFO[file.category]
            const blast = blastMap.get(file.path)

            // Split dir and basename for readable file presentation
            const lastSlash = file.path.lastIndexOf('/')
            const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : ''
            const baseName = lastSlash >= 0 ? file.path.slice(lastSlash + 1) : file.path

            return (
              <div
                key={file.path}
                className="card"
                style={{
                  overflow: 'hidden',
                  borderColor: isExpanded ? 'var(--line-hi)' : 'var(--line)',
                  background: 'var(--surface-2)',
                }}
              >
                {/* File Header Bar */}
                <button
                  type="button"
                  onClick={() => toggleExpand(file.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    gap: 8,
                  }}
                >
                  <div className="row" style={{ alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {isExpanded ? (
                      <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    )}

                    {/* Category badge */}
                    <span
                      className="badge mono"
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderColor: info.colorToken,
                        color: info.colorToken,
                        flexShrink: 0,
                      }}
                      title={tx(info.hint)}
                    >
                      {tx(info.label)}
                    </span>

                    {/* Path */}
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                      }}
                    >
                      {dir && <span style={{ color: 'var(--muted)' }}>{dir}</span>}
                      <b>{baseName}</b>
                    </span>

                    {/* New/Deleted badges */}
                    {file.isNew && (
                      <span className="badge badge-ok" style={{ fontSize: 10, flexShrink: 0 }}>
                        {tx({ en: 'new', pt: 'novo' })}
                      </span>
                    )}
                    {file.isDeleted && (
                      <span className="badge badge-crit" style={{ fontSize: 10, flexShrink: 0 }}>
                        {tx({ en: 'deleted', pt: 'removido' })}
                      </span>
                    )}

                    {/* Blast Radius pill */}
                    {blast && blast.dependents.length > 0 && (
                      <span
                        className={`badge ${blast.testFiles.length === 0 ? 'badge-warn' : 'badge-info'}`}
                        style={{ fontSize: 10, flexShrink: 0 }}
                        title={
                          blast.testFiles.length === 0
                            ? tx({
                                en: `${blast.dependents.length} dependent(s) outside diff, 0 test suites covering!`,
                                pt: `${blast.dependents.length} dependente(s) fora do diff, 0 suítes de teste cobrindo!`,
                              })
                            : tx({
                                en: `${blast.dependents.length} dependent(s) outside diff, ${blast.testFiles.length} test suite(s) covering.`,
                                pt: `${blast.dependents.length} dependente(s) fora do diff, ${blast.testFiles.length} suíte(s) de teste cobrindo.`,
                              })
                        }
                      >
                        ⚡ {blast.dependents.length} callers {blast.testFiles.length === 0 ? tx({ en: '(uncovered)', pt: '(sem testes)' }) : tx({ en: `(${blast.testFiles.length} tests)`, pt: `(${blast.testFiles.length} testes)` })}
                      </span>
                    )}
                  </div>

                  {/* Additions / Deletions */}
                  <div className="mono" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ color: 'var(--ok)' }}>+{file.insertions}</span>
                    <span style={{ color: 'var(--muted)', margin: '0 2px' }}>/</span>
                    <span style={{ color: 'var(--crit)' }}>-{file.deletions}</span>
                  </div>
                </button>

                {/* File Diff Body */}
                {isExpanded && (
                  <div
                    style={{
                      maxHeight: 460,
                      overflowY: 'auto',
                      overflowX: 'auto',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono, monospace)',
                      background: 'var(--surface-3)',
                      borderTop: '1px solid var(--line)',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        lineHeight: '1.45',
                        fontSize: 11,
                      }}
                    >
                      <tbody>
                        {file.lines.map((line, idx) => {
                          if (line.type === 'header') return null // omit raw diff headers from code display

                          if (line.type === 'hunk') {
                            return (
                              <tr
                                key={idx}
                                style={{
                                  background: 'var(--info-soft)',
                                  color: 'var(--info)',
                                  borderTop: '1px solid var(--line)',
                                  borderBottom: '1px solid var(--line)',
                                }}
                              >
                                <td
                                  colSpan={3}
                                  style={{
                                    padding: '3px 8px',
                                    fontWeight: 500,
                                    fontSize: 11,
                                  }}
                                >
                                  {line.text}
                                </td>
                              </tr>
                            )
                          }

                          const isAdd = line.type === 'add'
                          const isDel = line.type === 'del'

                          const rowBg = isAdd
                            ? 'var(--ok-soft)'
                            : isDel
                              ? 'var(--crit-soft)'
                              : 'transparent'
                          const textColor = isAdd
                            ? 'var(--ok)'
                            : isDel
                              ? 'var(--crit)'
                              : 'var(--ink)'
                          const marker = isAdd ? '+' : isDel ? '-' : ' '

                          return (
                            <tr
                              key={idx}
                              style={{
                                background: rowBg,
                                color: textColor,
                              }}
                            >
                              <td
                                style={{
                                  width: 44,
                                  textAlign: 'right',
                                  padding: '1px 6px',
                                  color: 'var(--muted)',
                                  userSelect: 'none',
                                  borderRight: '1px solid var(--line)',
                                  opacity: 0.6,
                                }}
                              >
                                {line.oldLineNumber ?? ''}
                              </td>
                              <td
                                style={{
                                  width: 44,
                                  textAlign: 'right',
                                  padding: '1px 6px',
                                  color: 'var(--muted)',
                                  userSelect: 'none',
                                  borderRight: '1px solid var(--line)',
                                  opacity: 0.6,
                                }}
                              >
                                {line.newLineNumber ?? ''}
                              </td>
                              <td
                                style={{
                                  padding: '1px 8px',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                }}
                              >
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 14,
                                    userSelect: 'none',
                                    opacity: 0.7,
                                  }}
                                >
                                  {marker}
                                </span>
                                {line.text}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
