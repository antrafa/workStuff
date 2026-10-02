import { Router, type Request, type Response } from 'express'
import { createSchedule, deleteSchedule, listAlerts, listSchedules, runSchedule, updateSchedule } from '../lib/schedules/scheduler.ts'

export const schedulesRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}

schedulesRouter.get('/', handle(() => ({ schedules: listSchedules(), alerts: listAlerts().slice(0, 50), platform: process.platform })))
schedulesRouter.post('/', handle(req => createSchedule(req.body ?? {})))
schedulesRouter.patch('/:id', handle(req => updateSchedule(String(req.params.id), req.body ?? {})))
schedulesRouter.delete('/:id', handle(req => deleteSchedule(String(req.params.id))))
// Roda agora, fora do intervalo: para conferir que a verificação funciona logo depois de criar.
schedulesRouter.post('/:id/run', handle(req => runSchedule(String(req.params.id))))
