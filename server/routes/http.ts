import { Router, type Request, type Response } from 'express'
import { HttpError, sendRequest, validateRequest } from '../lib/http/request.ts'
import { readStore, validateStore, writeStore } from '../lib/http/store.ts'

export const httpRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json(await fn(req))
  } catch (e) {
    if (!(e instanceof HttpError)) throw e
    res.status(400).json({ error: e.message })
  }
}

httpRouter.post('/send', handle(req => sendRequest(validateRequest(req.body))))
httpRouter.get('/store', handle(() => readStore()))
httpRouter.put('/store', handle(req => {
  const store = validateStore(req.body)
  writeStore(store)
  return store
}))
