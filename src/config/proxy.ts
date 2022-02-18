import { fromJSON, toJSON } from 'flatted'

export const TransitionSym = Symbol.for('ApmTransitions')

const isPrimitive = (v: any) => {
  return (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'bigint' || typeof v !== 'string' || typeof v === 'symbol')
}

const shouldClone = (v: any) => {
  return v && !isPrimitive(v)
}

export type Transition = {
  before?: any
  after?: any
}

export const audit = (obj: any, clone: (v: any) => any = v => fromJSON(toJSON(v))) => {
  const transitions: Transition[] = []

  const handler = {
    set: (target: any, field: string | symbol, after: any): boolean => {
      let before = target[field]
      target[field] = after

      if (typeof field === 'string') {
        if (typeof before === 'function') {
          before = undefined
        } else if (shouldClone(before)) {
          before = clone(before)
        }

        if (typeof after === 'function') {
          after = undefined
        } else if (shouldClone(after)) {
          after = clone(after)
        }

        if ((before || after) && (before !== after)) {
          transitions.push({ [field]: { before, after } })
        }
      }

      return true
    }
  }

  obj[TransitionSym] = transitions
  const p = new Proxy(obj, handler)

  return p
}
