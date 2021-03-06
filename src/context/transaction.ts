import { ISink, BlackHole } from '../sink/api'
import { AsyncLocalStorage } from 'async_hooks'

export const enum Status {
  success = 'success',
  error = 'error'
}

export const enum UnboundPolicy {
  error = 0,
  continue = 1
}

export const enum ErrorMappingOptions {
  stack = 1,
  stackAsArray = 2,
  trim = 4,
  filterFrames = 8
}

type Registry = {
  current: ISink<Transaction>
  policy: UnboundPolicy
  errors: ErrorMappingOptions
}

const R: Registry = {
  current: BlackHole<Transaction>(),
  policy: UnboundPolicy.continue,
  errors: ErrorMappingOptions.stack | ErrorMappingOptions.stackAsArray | ErrorMappingOptions.trim | ErrorMappingOptions.filterFrames
}

const map = (error: any) => {
  const message = error.message as string

  if (!(R.errors & ErrorMappingOptions.stack)) {
    delete error.stack
  } else if ((R.errors & ErrorMappingOptions.stackAsArray) && typeof error.stack === 'string') {
    let stack = error.stack = error.stack.split('\n') as string[]

    if (R.errors & ErrorMappingOptions.filterFrames) {
      const head = stack[0]
      if (head && typeof message === 'string' && message.length && head.endsWith(message)) {
        error.message = head
        if (!stack.shift()) {
          return
        }
      }

      stack = (error.stack as string[]).filter(v =>
        (v?.includes('/') && !v.includes('node:internal') && !v.includes('config/decorators'))
      )

      error.stack = stack
    }

    if (R.errors & ErrorMappingOptions.trim) {
      error.stack = (error.stack as string[]).map(v => v?.trim())
    }
  }
  return error
}

export class Transaction {
  module: string
  type: string
  method: string
  seq: number
  reqId?: string
  input?: any
  output?: any
  error?: any
  started?: Date
  finished?: Date
  took?: number
  status?: Status
  transitions?: any

  constructor (module: string, type: string, method: string, seq: number, reqId?: string) {
    this.module = module
    this.type = type
    this.method = method
    this.seq = seq
    this.reqId = reqId
  }

  private done (status: Status) {
    const end = new Date(Date.now())
    this.finished = end
    const s = this.started
    if (s) {
      this.took = end.getTime() - s.getTime()
    }

    this.status = status

    R.current.accept(this)
  }

  commence (names: string[] | null, args?: any[]) {
    this.input = names?.length && args
      ? names.map((name, ix) => {
        return { [name]: args[ix] }
      })
      : args?.length
        ? args
        : undefined
    this.started = new Date(Date.now())
  }

  end (output?: any, transitions?: any) {
    if (output !== undefined) {
      this.output = output
    }
    this.record(transitions)
    this.done(Status.success)
  }

  failed (err?: any, transitions?: any) {
    if (err) {
      this.error = map(err)
    }
    this.record(transitions)
    this.done(Status.error)
  }

  record (transitions?: any) {
    if (transitions) {
      this.transitions = transitions
    }
  }
}

interface CallContext {
  reqId: string
  seq: number
  get: (key: string) => any
  set: (key: string, value: any) => void
  setAll: (state?: Record<string, any>) => void
}

class CallContextImp implements CallContext {
  readonly reqId: string
  sequence: number
  state: Record<string, any>

  constructor (reqId: string, state?: Record<string, any>) {
    this.reqId = reqId
    this.sequence = 0
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

  get seq () {
    return this.sequence++
  }
}

const UnboundContext: CallContext = new CallContextImp('unbound')

interface ITransactionContext {
  isBound: () => boolean
  bind: (reqId: string) => void
  get: (key: string) => any
  set: (key: string, value: any) => void
  wrap: <R, Args extends any[]>(fn: (...args: Args) => R, extract: (...args: Args) => string) => (...args: Args) => Promise<R>
  wrapAsync: <R, Args extends any[]>(fn: (...args: Args) => Promise<R>, extract: (...args: Args) => string) => (...args: Args) => Promise<R>
  begin: (module: string, type: string, method: string) => Transaction
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
      if (R.policy === UnboundPolicy.continue) {
        return UnboundContext
      }
      throw new Error('Not Bound')
    }
    return ctx
  }

  begin (module: string, type: string, method: string) {
    const c = this.current()
    return new Transaction(module, type, method, c.seq, c.reqId)
  }

  run<R, Args extends any[]> (ctx: { reqId: string, state?: Record<string, any> }, fn: (...args: Args) => R, ...args: Args) {
    return this.storage.run(new CallContextImp(ctx.reqId, ctx.state), fn, ...args)
  }
}

export const TransactionContext: ITransactionContext = new TransactionContextImp()

export const use = (sink: ISink<Transaction>) => {
  R.current = sink
}

export const policy = (policy: UnboundPolicy) => {
  R.policy = policy
}

export const errorMapping = (options: ErrorMappingOptions) => {
  R.errors = options
}
