/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { TransactionContext } from '../context/transaction'

const ExcludeSym = Symbol.for('ApmExclude')
const IncludeSym = Symbol.for('ApmInclude')
const EntryPointSym = Symbol.for('ApmEntryPoint')
const TransformSym = Symbol.for('ApmTransform')

const cwd = (() => {
  try {
    let p = process.cwd()
    p = p[p.length - 1] === '/' ? p : p + '/'
    return p === '/' ? ' ' : p
  } catch (e) {
    return ' '
  }
})()

type Opts = {
  async: boolean
  sync: boolean
  exclude: string[]
  include: string[]
}

type EntryPointOpts = {
  exclude: boolean
  label: string
}

type ParsedEntryPointOpts = {
  reqId: <Args extends any[]> (...args: Args) => string
} & EntryPointOpts

const isFn = (curr: any, name: string) => {
  return (name !== 'constructor' && typeof curr[name] === 'function')
}

const isAsync = (fn: Function) => fn.constructor.name === 'AsyncFunction'

const destroySymbols = (obj: any) => {
  delete obj[ExcludeSym]
  delete obj[IncludeSym]
  delete obj[EntryPointSym]
  delete obj[TransformSym]
}

const Empty: string[] = []

const seen = new Set<any>()

const Exclude = function () {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    let filtered = target[ExcludeSym]

    if (!filtered) {
      filtered = target[ExcludeSym] = new Set()
    }

    filtered.add(propertyKey)
  }
}

const Include = function () {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    let include = target[IncludeSym]

    if (!include) {
      include = target[IncludeSym] = new Set()
    }

    include.add(propertyKey)
  }
}

const EntryPoint = function (reqId: (...args: any[]) => string, opts?: Partial<EntryPointOpts>) {
  const parsed: ParsedEntryPointOpts = {
    reqId,
    label: opts?.label ?? '',
    exclude: opts?.exclude ?? false
  }
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    let eps = target[EntryPointSym]

    if (!eps) {
      eps = target[EntryPointSym] = {}
    }

    eps[propertyKey] = parsed
  }
}

type TransformOptions = {
  input: (args: any[]) => any[]
  output: (o: any) => any
}

const noop = (o: any) => o

const NoopOpts: TransformOptions = {
  input: noop,
  output: noop
}

const Transform = (opts: Partial<TransformOptions> = NoopOpts) => {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    let transform = target[TransformSym]

    if (!transform) {
      transform = target[TransformSym] = {}
    }

    transform[propertyKey] = {
      input: opts.input ?? noop,
      output: opts.output ?? noop
    }
  }
}

const argNames = (fn: Function) => {
  const code = fn.toString().replace(/[^A-Z0-9_,()?]/gi, '')
  const begin = code.indexOf('(')
  const end = code.indexOf(')')
  let result: string[] | null = null
  if (begin >= 0 && end > (begin + 1)) {
    result = code.substring(begin + 1, end).split(',')
  }
  return result
}

const getStackTrace = function (...args: any[]) {
  const err = {
    name: 'Trace',
    message: args
  }
  Error.captureStackTrace(err, getStackTrace)
  return ((err as any).stack as string) ?? ''
}

const moduleOf = (obj: any) => {
  let stack
  let ix: number
  if (obj instanceof Error) {
    stack = (obj.stack ?? '').split('\n')
    ix = 2
  } else {
    stack = getStackTrace(obj).split('\n')

    ix = (() => {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].includes('config/decorators')) {
          return i + 1
        }
      }
      return -1
    })()
  }

  let frame = stack[ix]

  if (frame) {
    ix = frame.lastIndexOf(':')
    const start = frame.indexOf('(')

    if (start > 0 && (ix = frame.indexOf(':', start)) > start) {
      frame = frame.substring(start + 1, ix)
    } else {
      ix = frame.lastIndexOf(' ')
      frame = ix >= 0 ? frame.substring(ix + 1) : frame
    }

    frame = frame.replace(cwd, '')

    return frame
  }

  return ''
}

const ProxyFactory = {
  sync: (module: string, type: string, proto: any, fn: Function, method: string, alias?: string) => {
    const names = argNames(fn)
    const transform = proto[TransformSym] ? proto[TransformSym][fn.name] ?? NoopOpts : NoopOpts
    proto[method] = function (...args: any[]) {
      const txn = TransactionContext.begin(module, type, alias ?? method)
      txn.commence(names, transform.input(args))
      try {
        const res = fn.call(this, ...args)
        txn.end(transform.output(res))
        return res
      } catch (e) {
        txn.failed(e)
        throw e
      }
    }
  },
  async: (module: string, type: string, proto: any, fn: Function, method: string, alias?: string) => {
    const names = argNames(fn)
    const transform = proto[TransformSym] ? proto[TransformSym][fn.name] ?? NoopOpts : NoopOpts

    proto[method] = async function (...args: any[]) {
      const txn = TransactionContext.begin(module, type, alias ?? method)
      txn.commence(names, transform.input(args))
      try {
        const res = await fn.call(this, ...args)
        txn.end(transform.output(res))
        return res
      } catch (e) {
        txn.failed(e)
        throw e
      }
    }
  },
  entryPoint: (module: string, type: string, proto: any, method: string, opts: ParsedEntryPointOpts, includes: Set<string>) => {
    let fn = proto[method]
    const isAsyncFn = isAsync(fn)

    if (includes.has(method)) {
      if (isAsyncFn) {
        ProxyFactory.async(module, type, proto, fn, method, opts.label)
      } else {
        ProxyFactory.sync(module, type, proto, fn, method, opts.label)
      }
      fn = proto[method]
      includes.delete(method)
    }

    proto[method] = function (...args: any[]) {
      const reqId = opts.reqId.apply(this, args)
      return TransactionContext.run({ reqId }, fn.bind(this), ...args)
    }
  },
  wrap: <T extends Function> (fn: T): T => {
    const name = fn.name
    const names = argNames(fn)
    const module = moduleOf(fn)
    let rv: unknown
    if (isAsync(fn)) {
      rv = async function (...args: any[]) {
        const txn = TransactionContext.begin(module, '', name)
        txn.commence(names, args)
        try {
          const res = await fn.apply(null, args)
          txn.end(res)
          return res
        } catch (e) {
          txn.failed(e)
          throw e
        }
      }
    } else {
      rv = function (...args: any[]) {
        const txn = TransactionContext.begin(module, '', name)
        txn.commence(names, args)
        try {
          const res = fn.apply(null, args)
          txn.end(res)
          return res
        } catch (e) {
          txn.failed(e)
          throw e
        }
      }
    }

    return rv as T
  }
}

const instrument = (module: string, type: string, proto: any, opts: Opts) => {
  const names = Object.getOwnPropertyNames(proto)
  const excluded = proto[ExcludeSym] as Set<string> | undefined
  const included = proto[IncludeSym] as Set<string> | undefined
  const entries = (proto[EntryPointSym] ?? {}) as Record<string, ParsedEntryPointOpts>
  const interceptable = new Set<string>()
  const eps = new Set<string>()

  names.forEach(name => {
    if (isFn(proto, name)) {
      const e = entries[name]

      if (e) {
        eps.add(name)
      }

      if (opts.exclude.includes(name) || excluded?.has(name)) {
        return
      }

      if (entries[name]?.exclude) {
        return
      }

      if (opts.include.includes(name) || included?.has(name)) {
        interceptable.add(name)
        return
      }

      const isASync = proto[name].constructor.name === 'AsyncFunction'

      const trap = isASync ? opts.async : opts.sync
      if (trap) {
        interceptable.add(name)
      }
    }
  })

  if (eps.size) {
    for (const ep of eps) {
      ProxyFactory.entryPoint(module, type, proto, ep, entries[ep], interceptable)
    }
  }

  if (interceptable.size) {
    for (const method of interceptable) {
      const fn = proto[method]

      if (isAsync(fn)) {
        ProxyFactory.async(module, type, proto, fn, method)
      } else {
        ProxyFactory.sync(module, type, proto, fn, method)
      }
    }
  }

  destroySymbols(proto)
}

const Enable = function (options: Partial<Opts> = { async: true, sync: false, exclude: Empty, include: Empty }) {
  const opts: Opts = {
    async: options.async === undefined ? true : options.async,
    sync: !!options.sync,
    exclude: options.exclude ?? Empty,
    include: options.include ?? Empty
  }

  /**
   * Trap call site where Enable is invoked. This happens at module load-time,
   * so we are guaranteed to find the location 1 stack frame bellow
   */
  const module = moduleOf(new Error())

  return function <T extends new (...args: any[]) => {}> (ctor: T) {
    if (!ctor.name || seen.has(ctor)) {
      return
    }

    seen.add(ctor)

    instrument(module, ctor.name, ctor.prototype, opts)
  }
}

export const Apm = {
  Exclude,
  Include,
  EntryPoint,
  Enable,
  Transform,
  wrap: ProxyFactory.wrap
}
