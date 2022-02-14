import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

@Apm.Enable()
class A {
  foo: string

  constructor (foo: string) {
    this.foo = foo
  }

  async add (a: number, b: number) {
    return a + b
  }
}

@Apm.Enable()
class B extends A {
  bar: string

  constructor (foo: string, bar: string) {
    super(foo)
    this.bar = bar
  }

  async add (a: number, b: number) {
    return super.add(a, b)
  }
}

@Apm.Enable()
class C extends B {
  bar: string

  constructor (foo: string, bar: string) {
    super(foo, bar)
    this.bar = bar
  }

  async add (a: number, b: number) {
    return super.add(a, b)
  }
}

describe('Proxy inheritance', () => {
  const sink = new RecordingSink()

  beforeAll(() => {
    use(sink)
  })

  beforeEach(() => {
    sink.flush()
  })

  it('Will Proxy Parent method', async () => {
    const id = random()
    TransactionContext.bind(id)

    const c = new C('foo', 'bar')

    expect(await c.add(1, 2)).toBe(3)

    expect(sink.completed).toBe(3)

    let txn = sink.pop()
    expect(txn.type).toBe('C')
    expect(txn.method).toBe('add')
    expect(txn.output).toBe(3)

    txn = sink.pop()
    expect(txn.type).toBe('B')
    expect(txn.method).toBe('add')
    expect(txn.output).toBe(3)

    txn = sink.pop()
    expect(txn.type).toBe('A')
    expect(txn.method).toBe('add')
    expect(txn.output).toBe(3)
  })
})
