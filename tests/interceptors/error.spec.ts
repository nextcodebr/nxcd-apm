/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'
import { delay } from '@/test/util'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

@Apm.Enable({ sync: true })
class A {
  error (str?: string) {
    return str!.length
  }

  async errorAsync (str?: string) {
    await delay(1)
    return str!.length
  }

  objectError () {
    throw ('bad-practice' as unknown) as Error
  }

  manipulatedError () {
    const e = new Error()
    const stack = e.stack?.split('\n')
    stack?.shift()
    stack?.shift()
    e.stack = stack?.join('\n')
    throw e
  }
}

describe('Error Trap', () => {
  const sink = new RecordingSink()

  use(sink)

  afterEach(() => {
    sink.flush()
  })

  const a = new A()

  it('Will capture errors', async () => {
    TransactionContext.bind(random())
    let r: any

    try {
      r = a.error()
    } catch (e) {
      r = e
    }

    expect(r instanceof Error).toBeTruthy()
    // expect(() => a.error()).toThrow()

    let txn = sink.pop()
    expect(txn.input).toEqual([{ str: undefined }])
    expect(Array.isArray(txn.error?.stack)).toBeTruthy()
    expect((txn.error?.stack[0] as string).startsWith('at A.error')).toBeTruthy()

    try {
      r = await a.errorAsync()
    } catch (e) {
      r = e
    }

    expect(r instanceof Error).toBeTruthy()

    txn = sink.pop()
    expect(txn.input).toEqual([{ str: undefined }])
    expect(Array.isArray(txn.error?.stack)).toBeTruthy()
    expect((txn.error?.stack[0] as string).startsWith('at A.errorAsync')).toBeTruthy()

    try {
      r = a.objectError()
    } catch (e) {
      r = e
    }
    expect(r).toBe('bad-practice')
    txn = sink.pop()
    expect(txn.error).toBe('bad-practice')

    try {
      r = a.manipulatedError()
    } catch (e) {
      r = e
    }
    expect(typeof r).toBeTruthy()
    txn = sink.pop()
    expect((txn.error?.stack[0] as string).startsWith('at A.manipulatedError')).toBeFalsy()
  })
})
