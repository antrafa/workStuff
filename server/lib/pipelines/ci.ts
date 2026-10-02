// Leitura de pipelines, jobs e log de job no GitLab CI e no GitHub Actions. Só leitura.

import { call, send, type Conn } from '../repos/providers.ts'
import { RepoError } from '../repos/sources.ts'
import { normalizePath } from '../repos/layout.ts'
import { gitlabStatus, githubStatus, secondsBetween, type Job, type Pipeline } from './normalize.ts'

type GlPipeline = { id: number; iid: number; status: string; source: string; ref: string; sha: string; web_url: string; created_at: string; updated_at: string }
type GlJob = { id: number; name: string; stage: string; status: string; allow_failure: boolean; web_url: string; duration: number | null }
type GhRun = {
  id: number; name: string; display_title: string; status: string; conclusion: string | null; head_branch: string; head_sha: string
  html_url: string; created_at: string; run_started_at: string | null; updated_at: string
}
type GhJob = {
  id: number; name: string; status: string; conclusion: string | null; html_url: string; started_at: string | null; completed_at: string | null
  steps?: { name: string; conclusion: string | null }[]
}

const FINISHED = new Set(['success', 'failed', 'canceled', 'skipped'])

const glProject = (fullPath: string) => `/projects/${encodeURIComponent(normalizePath(fullPath))}`

function ghRepo(fullPath: string) {
  const parts = normalizePath(fullPath).split('/')
  if (parts.length !== 2) throw new RepoError('no GitHub o projeto é dono/repositório')
  return `/repos/${parts.map(encodeURIComponent).join('/')}`
}

// Os ids chegam pela URL: só números, para não virarem caminho de API arbitrário.
function numericId(id: string) {
  if (!/^\d{1,20}$/.test(id)) throw new RepoError('identificador inválido')
  return id
}

export async function recentPipelines(c: Conn, fullPath: string, limit = 10): Promise<Pipeline[]> {
  if (c.provider === 'gitlab') {
    const { data } = await call(c, `${glProject(fullPath)}/pipelines?per_page=${limit}&order_by=id&sort=desc`)
    return (data as GlPipeline[]).map(p => {
      const status = gitlabStatus(p.status)
      return {
        id: String(p.id), status, ref: p.ref, sha: p.sha.slice(0, 8), title: `#${p.iid} · ${p.source}`, webUrl: p.web_url,
        createdAt: p.created_at, durationSec: FINISHED.has(status) ? secondsBetween(p.created_at, p.updated_at) : null,
      }
    })
  }
  const { data } = await call(c, `${ghRepo(fullPath)}/actions/runs?per_page=${limit}`)
  return (data as { workflow_runs: GhRun[] }).workflow_runs.map(r => {
    const status = githubStatus(r.status, r.conclusion)
    return {
      id: String(r.id), status, ref: r.head_branch, sha: r.head_sha.slice(0, 8), title: `${r.name} · ${r.display_title}`, webUrl: r.html_url,
      createdAt: r.created_at, durationSec: FINISHED.has(status) ? secondsBetween(r.run_started_at ?? r.created_at, r.updated_at) : null,
    }
  })
}

export async function pipelineJobs(c: Conn, fullPath: string, pipelineId: string): Promise<Job[]> {
  const id = numericId(pipelineId)
  if (c.provider === 'gitlab') {
    const { data } = await call(c, `${glProject(fullPath)}/pipelines/${id}/jobs?per_page=100`)
    return (data as GlJob[])
      .map(j => ({
        id: String(j.id), name: j.name, stage: j.stage, status: gitlabStatus(j.status), allowFailure: j.allow_failure,
        failedStep: null, webUrl: j.web_url, durationSec: j.duration === null ? null : Math.round(j.duration),
      }))
      .sort((a, b) => Number(a.id) - Number(b.id))
  }
  const { data } = await call(c, `${ghRepo(fullPath)}/actions/runs/${id}/jobs?per_page=100`)
  return (data as { jobs: GhJob[] }).jobs.map(j => ({
    id: String(j.id), name: j.name, stage: '', status: githubStatus(j.status, j.conclusion), allowFailure: false,
    failedStep: j.steps?.find(s => s.conclusion === 'failure')?.name ?? null,
    webUrl: j.html_url, durationSec: secondsBetween(j.started_at, j.completed_at),
  }))
}

// GitHub responde com redirecionamento para um endereço assinado; o fetch segue e descarta o
// Authorization ao trocar de host, que é o comportamento certo aqui.
export async function jobLog(c: Conn, fullPath: string, jobId: string): Promise<string> {
  const id = numericId(jobId)
  const path = c.provider === 'gitlab' ? `${glProject(fullPath)}/jobs/${id}/trace` : `${ghRepo(fullPath)}/actions/jobs/${id}/logs`
  return (await send(c, path)).text()
}
