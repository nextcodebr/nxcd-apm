import { ISink, BlackHole } from '../sink/api'
import { AsyncLocalStorage } from 'async_hooks'

const enum Status {
  success = 'success',
  error = 'error'
}

type Registry = {
  current: ISink<Transaction>
}

const R: Registry = {
  current: BlackHole<Transaction>()
}

export class Transaction {
  type: string
  method: string
  reqId?: string
  input?: any
  output?: any
  error: any
  started?: Date
  finished?: Date
  took?: number
  status?: Status

  constructor (type: string, method: string, reqId?: string) {
    this.type = type
    this.method = method
    this.reqId = reqId
  }

  begin (names: string[] | null, args: any[]) {
    this.input = names?.length
      ? names.map((name, ix) => {
        return { [name]: args[ix] }
      })
      : args
    this.started = new Date()
  }

  end (output?: any) {
    if (output !== undefined) {
      this.output = output
    }
    this.done(Status.success)
  }

  failed (err?: any) {
    if (err !== undefined) {
      this.error = err
    }
    this.done(Status.error)
  }

  private done (status: Status) {
    const end = new Date()
    this.finished = end
    const s = this.started
    if (s) {
      this.took = end.getTime() - s.getTime()
    }

    this.status = status

    R.current.accept(this)
  }
}

interface CallContext {
  reqId: string
  get: (key: string) => any
  set: (key: string, value: any) => void
  setAll: (state?: Record<string, any>) => void
}

class CallContextImp implements CallContext {
  readonly reqId: string
  state: Record<string, any>

  constructor (reqId: string, state?: Record<string, any>) {
    this.reqId = reqId
    this.state = state ?? {}
  }

  get (key: string) {
    return this.state[key]
  }

  set (key: string, value: any) {
    this.state[key] = value
  }

  setAll (state?: Record<string, any>) {
    if (state) {
      this.state = { ...this.state, ...state }
    }
  }
}

interface ITransactionContext {
  isBound: () => boolean
  bind: (reqId: string) => void
  get: (key: string) => any
  set: (key: string, value: any) => void
  wrap: <R, Args extends any[]>(fn: (...args: Args) => R, extract: (...args: Args) => string) => (...args: Args) => Promise<R>
  wrapAsync: <R, Args extends any[]>(fn: (...args: Args) => Promise<R>, extract: (...args: Args) => string) => (...args: Args) => Promise<R>
  beginTransaction: (type: string, method: string) => Transaction
  run: <R, Args extends any[]> (ctx: { reqId: string, state?: Record<string, any> }, fn: (...args: Args) => R, ...args: Args) => R
  reqId: string
}

class TransactionContextImp implements ITransactionContext {
  storage: AsyncLocalStorage<CallContext>

  constructor () {
    this.storage = new AsyncLocalStorage()
  }

  isBound () {
    return Boolean(this.storage.getStore())
  }

  bind (reqId: string): void {
    this.storage.enterWith(new CallContextImp(reqId))
  }

  wrap<R, Args extends any[]> (fn: (...args: Args) => R, extract: (...args: Args) => string) {
    return async (...args: Args) => {
      this.bind(extract(...args))
      return fn(...args)
    }
  }

  wrapAsync<R, Args extends any[]> (fn: (...args: Args) => Promise<R>, extract: (...args: Args) => string) {
    return async (...args: Args) => {
      this.bind(extract(...args))
      const r = await fn(...args)
      return r
    }
  }

  get (key: string) {
    return this.current().get(key)
  }

  set (key: string, value: any) {
    this.current().set(key, value)
  }

  get reqId () {
    return this.current().reqId
  }

  private current () {
    const ctx = this.storage.getStore()
    if (!ctx) {
      throw new Error('Not Bound')
    }
    return ctx
  }

  beginTransaction (type: string, method: string) {
    return new Transaction(type, method, this.reqId)
  }

  run<R, Args extends any[]> (ctx: { reqId: string, state?: Record<string, any> }, fn: (...args: Args) => R, ...args: Args) {
    return this.storage.run(new CallContextImp(ctx.reqId, ctx.state), fn, ...args)
  }
}

export const TransactionContext: ITransactionContext = new TransactionContextImp()

export const use = (sink: ISink<Transaction>) => {
  R.current = sink
}
