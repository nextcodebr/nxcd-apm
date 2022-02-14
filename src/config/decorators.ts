/* eslint-disable @typescript-eslint/no-dynamic-delete */
import 'reflect-metadata'
import { TransactionContext } from '../context/transaction'

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
  sync: (type: string, self: any, fn: Function, method: string, alias?: string) => {
    const names = argNames(fn)
    const bound = fn.bind(self)
    self[method] = function (...args: any[]) {
      const txn = TransactionContext.beginTransaction(type, alias ?? method)
      txn.begin(names, args)
      try {
        const res = bound.apply(self, args)
        txn.end(res)
        return res
      } catch (e) {
        txn.failed(e)
        throw e
      }
    }
  },
  async: (type: string, self: any, fn: Function, method: string, alias?: string) => {
    const names = argNames(fn)
    const bound = fn.bind(self)
    self[method] = async function (...args: any[]) {
      const txn = TransactionContext.beginTransaction(type, alias ?? method)
      txn.begin(names, args)
      try {
        const res = await bound.apply(self, args)
        txn.end(res)
        return res
      } catch (e) {
        txn.failed(e)
        throw e
      }
    }
  },
  entryPoint: (type: string, self: any, method: string, opts: ParsedEntryPointOpts, includes: Set<string>) => {
    let fn = self[method]
    const isAsyncFn = isAsync(fn)

    if (includes.has(method)) {
      if (isAsyncFn) {
        ProxyFactory.async(type, self, fn, method, opts.label)
      } else {
        ProxyFactory.sync(type, self, fn, method, opts.label)
      }
      fn = self[method].bind(self)
      includes.delete(method)
    } else {
      fn = fn.bind(self)
    }

    self[method] = function (...args: any[]) {
      const reqId = opts.reqId.apply(null, args)
      return TransactionContext.run({ reqId }, fn, ...args)
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
        const self = this as any
        const root = ctor
        let curr = root.prototype

        do {
          const names = Object.getOwnPropertyNames(curr)
          const excluded = curr[ExcludeSym] as Set<string> | undefined
          const included = curr[IncludeSym] as Set<string> | undefined
          const entries = (curr[EntryPointSym] ?? {}) as Record<string, ParsedEntryPointOpts>
          const interceptable = new Set<string>()
          const eps = new Set<string>()

          names.forEach(name => {
            if (isFn(curr, name)) {
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

              const isASync = curr[name].constructor.name === 'AsyncFunction'

              const trap = isASync ? opts.async : opts.sync
              if (trap) {
                interceptable.add(name)
              }
            }
          })

          if (eps.size) {
            for (const ep of eps) {
              ProxyFactory.entryPoint(root.name, self, ep, entries[ep], interceptable)
            }
          }

          if (interceptable.size) {
            for (const method of interceptable) {
              const fn = self[method]

              if (isAsync(fn)) {
                ProxyFactory.async(root.name, self, fn, method)
              } else {
                ProxyFactory.sync(root.name, self, fn, method)
              }
            }
          }

          destroySymbols(curr)
          curr = curr.prototype
        } while (curr)
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
