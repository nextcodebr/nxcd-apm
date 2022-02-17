import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'
import { delay } from '@/test/util'

const add = (a: number, b: number) => {
  return a + b
}

const addAsync = async (a: number, b: number) => {
  await delay(100)
  return a + b
}

describe('Argument Trap', () => {
  const sink = new RecordingSink()

  use(sink)

  afterEach(() => {
    sink.flush()
  })

  it('Will trap sync', async () => {
    TransactionContext.bind('1')
    const a = Apm.wrap(add)
    const r = a(1, 2)

    expect(r).toBe(3)

    const txn = sink.pop()
    expect(txn.module.includes('anon.spec')).toBeTruthy()
    expect(txn.type).toBe('')
    expect(txn.method).toBe('add')
    expect(txn.input).toEqual([{ a: 1 }, { b: 2 }])
    expect(txn.output).toEqual(r)
  })

  it('Will trap async sync', async () => {
    TransactionContext.bind('1')
    const a = Apm.wrap(addAsync)
    const r = await a(1, 2)

    expect(r).toBe(3)

    const txn = sink.pop()
    expect(txn.module.includes('anon.spec')).toBeTruthy()
    expect(txn.type).toBe('')
    expect(txn.method).toBe('addAsync')
    expect(txn.input).toEqual([{ a: 1 }, { b: 2 }])
    expect(txn.output).toEqual(r)
  })
})
