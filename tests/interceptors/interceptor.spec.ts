import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

@Apm.Enable({ async: true, sync: false, include: ['foo', 'poo'], exclude: ['baz', 'caz'] })
class A {
  random: string

  constructor (random = 'rnd') {
    this.random = random
  }

  foo () {
    return this.random + 'foo'
  }

  @Apm.Exclude()
  bar () {
    return this.random + 'bar'
  }

  @Apm.Include()
  roo () {
    return this.random + 'roo'
  }

  car () {
    return this.random + 'car'
  }

  caz () {
    return this.random + 'caz'
  }

  @Apm.Exclude()
  async moo () {
    return this.random + 'moo'
  }

  async baz () {
    return this.random + 'baz'
  }

  async poo () {
    return this.random + 'poo'
  }

  @Apm.Include()
  async zoo () {
    return this.random + 'zoo'
  }
}

@Apm.Enable({ async: true, sync: true, include: ['foo', 'poo'], exclude: ['baz', 'caz'] })
class B {
  random: string

  constructor (random = 'rnd') {
    this.random = random
  }

  foo () {
    return this.random + 'foo'
  }

  @Apm.Exclude()
  bar () {
    return this.random + 'bar'
  }

  @Apm.Include()
  roo () {
    return this.random + 'roo'
  }

  car () {
    return this.random + 'car'
  }

  caz () {
    return this.random + 'caz'
  }

  @Apm.Exclude()
  async moo () {
    return this.random + 'moo'
  }

  async baz () {
    return this.random + 'baz'
  }

  async poo () {
    return this.random + 'poo'
  }

  @Apm.Include()
  async zoo () {
    return this.random + 'zoo'
  }
}

describe("@Apm.Enable({ async: true, sync: false, include: ['foo', 'poo'], exclude: ['baz', 'caz'] })", () => {
  const sink = new RecordingSink()

  beforeAll(() => {
    use(sink)
  })

  it('Will not proxy synchronous by default', () => {
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.bar()).toBe(`${rnd}bar`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy synchronous with exclude (redundant)', () => {
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.caz()).toBe(`${rnd}caz`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy synchronous with @Apm.Exclude (redundant)', () => {
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.bar()).toBe(`${rnd}bar`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy asynchronous with exclude', async () => {
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    const r = await a.baz()

    expect(r).toBe(`${rnd}baz`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy asynchronous with @Apm.Exclude', async () => {
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    const r = await a.moo()

    expect(r).toBe(`${rnd}moo`)
    expect(sink.completed).toBe(txns)
  })

  it('Will proxy synchronous with include', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.foo()).toBe(`${rnd}foo`)
    expect(sink.completed).toBe(txns + 1)
  })

  it('Will proxy synchronous with @Apm.Include', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    expect(a.roo()).toBe(`${rnd}roo`)
    expect(sink.completed).toBe(txns + 1)
  })

  it('Will proxy asynchronous by default ', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    const r = await a.poo()
    expect(r).toBe(`${rnd}poo`)
    expect(sink.completed).toBe(txns + 1)
  })

  it('Will proxy asyncronous with @Apm.Include (redundant)', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new A(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    const r = await a.zoo()
    expect(r).toBe(`${rnd}zoo`)
    expect(sink.completed).toBe(txns + 1)
  })
})

describe("@Apm.Aware({ async: true, sync: true, include: ['foo', 'poo'], exclude: ['baz', 'caz'] })", () => {
  const sink = new RecordingSink()

  beforeAll(() => {
    use(sink)
  })

  it('Will not proxy synchronous with exclude', () => {
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.caz()).toBe(`${rnd}caz`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy synchronous with @Apm.Exclude', () => {
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.bar()).toBe(`${rnd}bar`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy asynchronous with exclude', async () => {
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    const r = await a.baz()

    expect(r).toBe(`${rnd}baz`)
    expect(sink.completed).toBe(txns)
  })

  it('Will not proxy asynchronous with @Apm.Exclude', async () => {
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    const r = await a.moo()

    expect(r).toBe(`${rnd}moo`)
    expect(sink.completed).toBe(txns)
  })

  it('Will proxy synchronous by default', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBe(0)

    expect(a.foo()).toBe(`${rnd}foo`)
    expect(sink.completed).toBe(txns + 1)
    expect(a.car()).toBe(`${rnd}car`)
    expect(sink.completed).toBe(txns + 2)
  })

  it('Will proxy synchronous with include', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    expect(a.foo()).toBe(`${rnd}foo`)
    expect(sink.completed).toBe(txns + 1)
  })

  it('Will proxy synchronous with @Apm.Include (redundant)', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    expect(a.roo()).toBe(`${rnd}roo`)
    expect(sink.completed).toBe(txns + 1)
  })

  it('Will proxy asynchronous by default ', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    const r = await a.poo()
    expect(r).toBe(`${rnd}poo`)
    expect(sink.completed).toBe(txns + 1)
  })

  it('Will proxy asyncronous with @Apm.Include (redundant)', async () => {
    TransactionContext.bind(random())
    const rnd = random()
    const a = new B(rnd)
    const txns = sink.completed
    expect(txns).toBeGreaterThan(0)

    const r = await a.zoo()
    expect(r).toBe(`${rnd}zoo`)
    expect(sink.completed).toBe(txns + 1)
  })
})
