import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

@Apm.Enable({ sync: true })
class A {
  @Apm.Transform({ output: (o: { width: number, height: number }) => { return { wrapped: { o } } } })
  resize (dims: { width: number, height: number }, scale: number) {
    const o = { ...dims }
    o.width = o.width * scale
    o.height = o.height * scale
    return o
  }

  @Apm.Transform({ input: (a: number, b: number) => [{ _a: a }, { _b: b }] })
  add (a: number, b: number) {
    return a + b
  }

  @Apm.Transform({ input: (a: number, b: number) => [{ _a: a }, { _b: b }], output: (r: number) => { return { res: r } } })
  mul (a: number, b: number) {
    return a * b
  }
}

describe('Argument Trap', () => {
  const sink = new RecordingSink()

  use(sink)

  afterEach(() => {
    sink.flush()
  })

  const a = new A()

  it('Will transform input only', async () => {
    TransactionContext.bind(random())
    const r = a.add(1, 2)
    expect(r).toBe(3)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ a: { _a: 1 } }, { b: { _b: 2 } }])
    expect(txn.output).toEqual(3)
  })

  it('Will transform output only', async () => {
    TransactionContext.bind(random())
    const r = a.resize({ width: 1, height: 2 }, 2)
    expect(r).toEqual({ width: 2, height: 4 })

    const txn = sink.pop()
    expect(txn.input).toEqual([{ dims: { width: 1, height: 2 } }, { scale: 2 }])
    expect(txn.output).toEqual({ wrapped: { o: r } })
  })

  it('Will transform input and output', async () => {
    TransactionContext.bind(random())
    const r = a.mul(3, 4)
    expect(r).toEqual(12)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ a: { _a: 3 } }, { b: { _b: 4 } }])
    expect(txn.output).toEqual({ res: r })
  })
})
