import express, { type ErrorRequestHandler } from 'express'
import { DATA_DIR } from './lib/paths.ts'
import { aiProvidersRouter } from './routes/aiProviders.ts'
import { analysisRouter } from './routes/analysis.ts'
import { catalogRouter } from './routes/catalog.ts'
import { clusterDoctorRouter } from './routes/clusterDoctor.ts'
import { doctorRouter } from './routes/doctor.ts'
import { reposRouter } from './routes/repos.ts'
import { resourcesRouter } from './routes/resources.ts'
import { k8sRouter } from './routes/k8s.ts'
import { performanceRouter } from './routes/performance.ts'
import { pipelinesRouter } from './routes/pipelines.ts'
import { vulnsRouter } from './routes/vulns.ts'
import { upgradeRouter } from './routes/upgrade.ts'
import { compareRouter } from './routes/compare.ts'
import { incidentRouter } from './routes/incident.ts'
import { reviewRouter } from './routes/review.ts'
import { profileRouter } from './routes/profile.ts'
import { settingsRouter } from './routes/settings.ts'

const PORT = Number(process.env.PORT ?? 3101)
const app = express()

app.use(express.json({ limit: '1mb' }))
app.use('/api/settings', settingsRouter)
app.use('/api/ai/providers', aiProvidersRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/doctor', doctorRouter)
app.use('/api/k8s', k8sRouter)
app.use('/api/cluster-doctor', clusterDoctorRouter)
app.use('/api/analysis', analysisRouter)
app.use('/api/resources', resourcesRouter)
app.use('/api/repos', reposRouter)
app.use('/api/performance', performanceRouter)
app.use('/api/pipelines', pipelinesRouter)
app.use('/api/vulns', vulnsRouter)
app.use('/api/upgrade', upgradeRouter)
app.use('/api/compare', compareRouter)
app.use('/api/incident', incidentRouter)
app.use('/api/review', reviewRouter)
app.use('/api/profile', profileRouter)

app.use('/api', (req, res) => {
  res.status(404).json({ error: `rota inexistente: ${req.method} ${req.originalUrl}` })
})

// Erro não tratado vira JSON com mensagem; o detalhe fica no log do servidor, não na tela.
const onError: ErrorRequestHandler = (err, req, res, _next) => {
  console.error(`[api] ${req.method} ${req.originalUrl} falhou:`, err)
  res.status(500).json({ error: 'erro interno no servidor; veja o terminal do npm run dev' })
}
app.use(onError)

// Só localhost: o painel roda comandos na máquina e não deve ficar exposto na rede.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT} · dados em ${DATA_DIR}`)
})
