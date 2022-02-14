import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

@Apm.Enable({ sync: true })
class A {
  plusOne (n: number) {
    return n + 1
  }

  add ( //
    a: number, //
    b: number) {
    return a + b
  }

  addOpt ( //
    a?: number, //
    b?: number) {
    return (a ?? 0) + (b ?? 0)
  }

  resize (dims: { width: number, height: number }, scale: number) {
    const o = { ...dims }
    o.width = o.width * scale
    o.height = o.height * scale
    return o
  }
}

describe('Argument Trap', () => {
  const sink = new RecordingSink()

  use(sink)

  afterEach(() => {
    sink.flush()
  })

  const a = new A()

  it('Will trap one primitive arg', async () => {
    TransactionContext.bind(random())
    const r = a.plusOne(2)

    expect(r).toBe(3)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ n: 2 }])
    expect(txn.output).toEqual(r)
  })

  it('Will trap two primitive args', async () => {
    TransactionContext.bind(random())
    const r = a.add(1, 2)
    expect(r).toBe(3)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ a: 1 }, { b: 2 }])
    expect(txn.output).toEqual(3)
  })

  it('Will trap object args', async () => {
    TransactionContext.bind(random())
    const r = a.resize({ width: 1, height: 2 }, 2)
    expect(r).toEqual({ width: 2, height: 4 })

    const txn = sink.pop()
    expect(txn.input).toEqual([{ dims: { width: 1, height: 2 } }, { scale: 2 }])
    expect(txn.output).toEqual({ width: 2, height: 4 })
  })

  it('Will trap optional args', async () => {
    TransactionContext.bind(random())
    const r = a.addOpt(1)
    expect(r).toEqual(1)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ a: 1 }, { b: undefined }])
    expect(txn.output).toEqual(1)
  })
})
