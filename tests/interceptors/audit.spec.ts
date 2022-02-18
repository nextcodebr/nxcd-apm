import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

@Apm.Enable({ sync: true })
class A {
  dims: { width: number, height: number } = { width: 1, height: 1 }

  @Apm.Audit()
  resize (scale: number) {
    const o = this.dims
    this.dims = { width: o.width * scale, height: o.height * scale }
  }

  @Apm.Audit()
  async resizeTwice (scale: number) {
    let o = this.dims
    this.dims = { width: o.width * scale, height: o.height * scale }
    o = this.dims
    this.dims = { width: o.width * scale, height: o.height * scale }
  }
}

describe('Argument Trap', () => {
  const sink = new RecordingSink()

  use(sink)

  afterEach(() => {
    sink.flush()
  })

  it('Will Audit', async () => {
    TransactionContext.bind(random())
    const a = new A()
    a.resize(10)
    expect(a.dims.width).toBe(10)
    expect(a.dims.height).toBe(10)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ scale: 10 }])
    expect(txn.output).toBeUndefined()
    expect(txn.transitions).toEqual([{ dims: { before: { width: 1, height: 1 }, after: { width: 10, height: 10 } } }])
  })

  it('Will Audit', async () => {
    TransactionContext.bind(random())
    const a = new A()
    await a.resizeTwice(10)
    expect(a.dims.width).toBe(100)
    expect(a.dims.height).toBe(100)

    const txn = sink.pop()
    expect(txn.input).toEqual([{ scale: 10 }])
    expect(txn.output).toBeUndefined()
    expect(txn.transitions).toEqual([
      {
        dims: { before: { width: 1, height: 1 }, after: { width: 10, height: 10 } }
      },
      {
        dims: { before: { width: 10, height: 10 }, after: { width: 100, height: 100 } }
      }
    ])
  })
})
