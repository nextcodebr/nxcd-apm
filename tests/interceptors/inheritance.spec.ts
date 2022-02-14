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

  async getFoo () {
    return this.foo
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

  async getFoo () {
    const pre = await super.getFoo()
    return pre + this.bar
  }

  async mul (a: number, b: number) {
    return a * b
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

    const b = new B('foo', 'bar')

    expect(await b.getFoo()).toBe('foobar')

    expect(sink.completed).toBe(2)

    let txn = sink.pop()

    expect(txn.type).toEqual('B')
    expect(txn.method).toEqual('getFoo')
    expect(txn.output).toEqual('foobar')

    txn = sink.pop()

    expect(txn.type).toEqual('A')
    expect(txn.method).toEqual('getFoo')
    expect(txn.output).toEqual('foo')

    const a = new A('roo')

    expect(await a.getFoo()).toBe('roo')
    expect(sink.completed).toBe(1)
    txn = sink.pop()
    expect(txn.type).toEqual('A')
    expect(txn.method).toEqual('getFoo')
    expect(txn.output).toEqual('roo')

    expect(await a.add(1, 2)).toBe(3)
    expect(sink.completed).toBe(1)
    txn = sink.pop()
    expect(txn.type).toEqual('A')
    expect(txn.method).toEqual('add')
    expect(txn.output).toEqual(3)

    expect(await b.add(1, 2)).toBe(3)
    expect(sink.completed).toBe(1)
    txn = sink.pop()
    expect(txn.type).toEqual('A')
    expect(txn.method).toEqual('add')
    expect(txn.output).toEqual(3)

    expect(await b.mul(2, 4)).toBe(8)
    expect(sink.completed).toBe(1)
    txn = sink.pop()
    expect(txn.type).toEqual('B')
    expect(txn.method).toEqual('mul')
    expect(txn.output).toEqual(8)
  })
})
