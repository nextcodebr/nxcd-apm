/* eslint-disable no-proto */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
import 'reflect-metadata'
import { TransactionContext } from '../context/transaction'
import { inspect } from 'node:util'

const ExcludeSym = Symbol.for('ApmExclude')
const IncludeSym = Symbol.for('ApmInclude')
const EntryPointSym = Symbol.for('ApmEntryPoint')

type ConfigOpts = {
  async?: boolean
  sync?: boolean
  exclude?: string[]
  include?: string[]
}

type EntryPointOpts = {
  exclude?: boolean
  label?: string
}

type ParsedEntryPointOpts = {
  reqId: <Args extends any[]> (...args: Args) => string
  exclude: boolean
  label: string
}

type Opts = {
  async: boolean
  sync: boolean
  exclude: string[]
  include: string[]
}

const isFn = (curr: any, name: string) => {
  return (name !== 'constructor' && typeof curr[name] === 'function')
}

const isAsync = (fn: Function) => fn.constructor.name === 'AsyncFunction'

const destroySymbols = (obj: any) => {
  // delete obj[ExcludeSym]
  // delete obj[IncludeSym]
  // delete obj[EntryPointSym]
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

const EntryPoint = function (reqId: (...args: any[]) => string, opts?: EntryPointOpts) {
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

const moduleOf = (fn: Function) => {
  return ''
}

const ProxyFactory = {
  sync: (type: string, proto: any, fn: Function, method: string, alias?: string) => {
    const names = argNames(fn)
    proto[method] = function (...args: any[]) {
      const txn = TransactionContext.beginTransaction(type, alias ?? method)
      txn.begin(names, args)
      try {
        const res = fn.call(this, ...args)
        txn.end(res)
        return res
      } catch (e) {
        txn.failed(e)
        throw e
      }
    }
  },
  async: (type: string, proto: any, fn: Function, method: string, alias?: string) => {
    const names = argNames(fn)

    proto[method] = async function (...args: any[]) {
      const txn = TransactionContext.beginTransaction(type, alias ?? method)
      txn.begin(names, args)
      try {
        const res = await fn.call(this, ...args)
        txn.end(res)
        return res
      } catch (e) {
        txn.failed(e)
        throw e
      }
    }
  },
  entryPoint: (type: string, proto: any, method: string, opts: ParsedEntryPointOpts, includes: Set<string>) => {
    let fn = proto[method]
    const isAsyncFn = isAsync(fn)

    if (includes.has(method)) {
      if (isAsyncFn) {
        ProxyFactory.async(type, proto, fn, method, opts.label)
      } else {
        ProxyFactory.sync(type, proto, fn, method, opts.label)
      }
      fn = proto[method]
      includes.delete(method)
    }

    proto[method] = function (...args: any[]) {
      const reqId = opts.reqId.apply(this, args)
      return TransactionContext.run({ reqId }, fn.bind(this), ...args)
    }
  },
  wrap: async <T extends Function> (fn: T): Promise<T> => {
    const name = fn.name
    const names = argNames(fn)
    const module = moduleOf(fn)
    let rv: unknown
    if (isAsync(fn)) {
      rv = async function (...args: any[]) {
        const txn = TransactionContext.beginTransaction(module, name)
        txn.begin(names, args)
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
        const txn = TransactionContext.beginTransaction(module, name)
        txn.begin(names, args)
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

const typeName = (self: any) => {
  // eslint-disable-next-line no-proto
  const p = self.__proto__
  const raw = inspect(p)
  const start = raw.indexOf('{')
  if (start > 0) {
    const name = raw.substring(0, start).trim()
    return name
  }
  return ''
}

const isClass = (obj: any) => {
  if (!obj?.name) {
    return false
  }

  const raw = inspect(obj)

  return raw.startsWith('class')
}

const instrument = (type: string, proto: any, opts: Opts) => {
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
      ProxyFactory.entryPoint(type, proto, ep, entries[ep], interceptable)
    }
  }

  if (interceptable.size) {
    for (const method of interceptable) {
      const fn = proto[method]

      if (isAsync(fn)) {
        ProxyFactory.async(type, proto, fn, method)
      } else {
        ProxyFactory.sync(type, proto, fn, method)
      }
    }
  }

  destroySymbols(proto)
}

const Enable = function (options: ConfigOpts = { async: true, sync: false, exclude: Empty, include: Empty }) {
  const opts: Opts = {
    async: options.async === undefined ? true : options.async,
    sync: !!options.sync,
    exclude: options.exclude ?? Empty,
    include: options.include ?? Empty
  }

  return function <T extends new (...args: any[]) => {}> (ctor: T) {
    return class extends ctor {
      constructor (...args: any[]) {
        super(...args)

        if (!ctor.name || seen.has(ctor)) {
          return
        }

        const self = this as any
        const type = typeName(self)
        const clazz = ctor.name

        if (type === clazz) {
          seen.add(ctor)
          instrument(type, ctor.prototype, opts)
        } else {
          do {
            if (!seen.has(ctor)) {
              seen.add(ctor)
              instrument(clazz, ctor.prototype, opts)
            }

            ctor = ctor.prototype
          } while (isClass(ctor))
        }
      }
    }
  }
}

export const Apm = {
  Exclude,
  Include,
  EntryPoint,
  Enable,
  WrapAnon: ProxyFactory.wrap
}
