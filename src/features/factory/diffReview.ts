// Categorização cognitiva e parsing estruturado de diffs de código.
// Inspirado nos princípios do pr-review-canvas: organiza a leitura humana priorizando
// lógica central de negócio, depois amarração de APIs/rotas, depois testes e por fim docs/metadados.

import type { Pair } from '../../../server/lib/lang.ts'
import { TEST_FILE, type DiffCategory } from '../../../server/lib/factory/types.ts'

export type { DiffCategory }

export type DiffLineType = 'add' | 'del' | 'hunk' | 'header' | 'context'

export interface ParsedDiffLine {
  type: DiffLineType
  text: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface ParsedFileDiff {
  path: string
  oldPath?: string
  category: DiffCategory
  insertions: number
  deletions: number
  isNew: boolean
  isDeleted: boolean
  lines: ParsedDiffLine[]
}

export const CATEGORY_ORDER: DiffCategory[] = ['core', 'wiring', 'tests', 'docs_meta']

export const CATEGORY_INFO: Record<DiffCategory, { label: Pair; hint: Pair; colorToken: string }> = {
  core: {
    label: { en: 'Core logic', pt: 'Lógica central' },
    hint: { en: 'Domain models, business logic and core rules', pt: 'Modelos de domínio, regras de negócio e lógica central' },
    colorToken: 'var(--fx-code)',
  },
  wiring: {
    label: { en: 'Wiring & API', pt: 'Integração & API' },
    hint: { en: 'Endpoints, routes, pipelines and configuration wiring', pt: 'Endpoints, rotas, pipelines e amarração de APIs' },
    colorToken: 'var(--fx-gates)',
  },
  tests: {
    label: { en: 'Tests', pt: 'Testes' },
    hint: { en: 'Unit, integration and verification suites', pt: 'Suítes unitárias, integração e verificação' },
    colorToken: 'var(--fx-tester)',
  },
  docs_meta: {
    label: { en: 'Docs & Meta', pt: 'Docs & Metadados' },
    hint: { en: 'Documentation, manifests, dependencies and tooling', pt: 'Documentação, manifestos, dependências e tooling' },
    colorToken: 'var(--muted)',
  },
}

const CATEGORY_PRIORITY: Record<DiffCategory, number> = {
  core: 0,
  wiring: 1,
  tests: 2,
  docs_meta: 3,
}

// Regex heuristics for path classification; tests use the same rule as the server gates

const DOCS_META_REGEX =
  /\.(md|markdown|txt|rst|adoc)$|^LICENSE$|^NOTICE$|(^|\/)docs?\/|(^|\/)(\.gitlab-ci\.yml|\.github\/|Dockerfile|docker-compose[^/]*|helm\/|charts\/|k8s\/|terraform\/)|\.tf$|(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pom\.xml|build\.gradle(\.kts)?|requirements[^/]*\.txt|pyproject\.toml|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?)$|(^|\/)(\.gitignore|\.editorconfig|tsconfig[a-zA-Z0-9.-]*\.json|vite\.config\.[a-zA-Z]+|eslint.*|\.prettierrc.*)$/i

const WIRING_REGEX =
  /(^|\/)(routes?|controllers?|endpoints?|api|handlers?|middlewares?|adapters?|cli)\/|(^|\/)(index|main|app|router|nav)\.(ts|js|tsx|jsx|go|py|rs)$/i

/**
 * Classifies a file path into a cognitive review category.
 */
export function categorizeFilePath(path: string): DiffCategory {
  const normalized = path.replace(/\\/g, '/')
  if (TEST_FILE.test(normalized)) return 'tests'
  if (DOCS_META_REGEX.test(normalized)) return 'docs_meta'
  if (WIRING_REGEX.test(normalized)) return 'wiring'
  return 'core'
}

/**
 * Parses a standard unified git diff into an ordered list of file diffs.
 */
export function parseUnifiedDiff(rawDiff: string): ParsedFileDiff[] {
  if (!rawDiff || !rawDiff.trim()) return []

  // Split on "diff --git " boundary
  const blocks = rawDiff.split(/^diff --git /m).filter(b => b.trim().length > 0)
  const files: ParsedFileDiff[] = []

  for (const block of blocks) {
    const rawLines = block.split('\n')
    const firstLine = rawLines[0] || ''
    
    // Parse paths from: a/path/to/file b/path/to/file
    let aPath = ''
    let bPath = ''
    const matchHeader = firstLine.match(/^a\/(.+?)\s+b\/(.+)$/)
    if (matchHeader) {
      aPath = matchHeader[1]
      bPath = matchHeader[2]
    }

    let isNew = false
    let isDeleted = false
    let explicitNewPath = ''
    let explicitOldPath = ''

    let headerDone = false
    let insertions = 0
    let deletions = 0
    const parsedLines: ParsedDiffLine[] = []

    let curOldLine = 0
    let curNewLine = 0

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]
      if (!line && i === rawLines.length - 1) continue // trailing newline

      if (!headerDone) {
        if (line.startsWith('new file mode')) isNew = true
        if (line.startsWith('deleted file mode')) isDeleted = true
        if (line.startsWith('--- ')) {
          const p = line.slice(4).trim()
          if (p === '/dev/null') isNew = true
          else explicitOldPath = p.replace(/^a\//, '')
        }
        if (line.startsWith('+++ ')) {
          const p = line.slice(4).trim()
          if (p === '/dev/null') isDeleted = true
          else explicitNewPath = p.replace(/^b\//, '')
        }

        if (line.startsWith('@@')) {
          headerDone = true
        } else {
          // Skip the diff command line itself from rendered header if desired, but keep for completeness
          parsedLines.push({ type: 'header', text: line })
          continue
        }
      }

      if (line.startsWith('@@')) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (hunkMatch) {
          curOldLine = parseInt(hunkMatch[1], 10)
          curNewLine = parseInt(hunkMatch[2], 10)
        }
        parsedLines.push({ type: 'hunk', text: line })
      } else if (line.startsWith('+')) {
        insertions++
        parsedLines.push({
          type: 'add',
          text: line.slice(1),
          newLineNumber: curNewLine++,
        })
      } else if (line.startsWith('-')) {
        deletions++
        parsedLines.push({
          type: 'del',
          text: line.slice(1),
          oldLineNumber: curOldLine++,
        })
      } else {
        // Context or metadata line
        const isContext = line.startsWith(' ')
        parsedLines.push({
          type: 'context',
          text: isContext ? line.slice(1) : line,
          oldLineNumber: isContext ? curOldLine++ : undefined,
          newLineNumber: isContext ? curNewLine++ : undefined,
        })
      }
    }

    const finalPath = isDeleted
      ? (explicitOldPath || aPath || 'unknown')
      : (explicitNewPath || bPath || explicitOldPath || aPath || 'unknown')

    const category = categorizeFilePath(finalPath)

    files.push({
      path: finalPath,
      oldPath: isDeleted ? undefined : (explicitOldPath || aPath),
      category,
      insertions,
      deletions,
      isNew,
      isDeleted,
      lines: parsedLines,
    })
  }

  // Sort files: Core first, then Wiring, then Tests, then Docs & Meta. Within category, sort by path.
  files.sort((a, b) => {
    const diffCat = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]
    if (diffCat !== 0) return diffCat
    return a.path.localeCompare(b.path)
  })

  return files
}

/**
 * Groups parsed file diffs by cognitive category.
 */
export function groupDiffByCategory(files: ParsedFileDiff[]): Record<DiffCategory, ParsedFileDiff[]> {
  const groups: Record<DiffCategory, ParsedFileDiff[]> = {
    core: [],
    wiring: [],
    tests: [],
    docs_meta: [],
  }
  for (const f of files) {
    groups[f.category].push(f)
  }
  return groups
}
