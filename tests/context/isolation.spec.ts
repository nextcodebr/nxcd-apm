import { Apm } from '@/config'
import { use, TransactionContext } from '@/context/transaction'
import { delay } from '@/test/util'
import { RecordingSink } from '../share'

const random = () => {
  return (Math.random() * 1000).toFixed(0)
}

const maskNull = (obj: any) => {
  return obj ? obj as string : ''
}

@Apm.Enable({ async: true, sync: true })
class A {
  random: string

  constructor (random = 'rnd') {
    this.random = random
  }

  foo () {
    return this.random + 'foo' + maskNull(TransactionContext.get('foo')) + TransactionContext.reqId
  }

  async bar () {
    await delay(1)
    return this.random + 'bar' + maskNull(TransactionContext.get('bar')) + TransactionContext.reqId
  }
}

const MAX = 1000
const TXNS = 6

describe('Run With Binding', () => {
  const sink = new RecordingSink()

  beforeAll(() => {
    use(sink)
  })

  const task = async (reqId: string, index: number) => {
    TransactionContext.bind(reqId)

    const rnd = random()
    const a = new A(rnd)

    TransactionContext.set('foo', `${index}`)
    TransactionContext.set('bar', `${index}`)

    const sub = async () => {
      let currId = TransactionContext.reqId
      expect(currId).toBe(reqId)

      let foo = a.foo()

      expect(foo).toBe(`${rnd}foo${index}${TransactionContext.reqId}`)
      expect(foo).toBe(`${rnd}foo${index}${currId}`)

      let bar = await a.bar()
      expect(bar).toBe(`${rnd}bar${index}${TransactionContext.reqId}`)
      expect(bar).toBe(`${rnd}bar${index}${currId}`)

      TransactionContext.set('foo', `_X_${index}`)
      TransactionContext.set('bar', `_X_${index}`)

      foo = a.foo()
      expect(foo).toBe(`${rnd}foo_X_${index}${TransactionContext.reqId}`)
      expect(foo).toBe(`${rnd}foo_X_${index}${currId}`)

      bar = await a.bar()
      expect(bar).toBe(`${rnd}bar_X_${index}${TransactionContext.reqId}`)
      expect(bar).toBe(`${rnd}bar_X_${index}${currId}`)

      const subsub = async () => {
        currId = TransactionContext.reqId
        expect(TransactionContext.reqId).toBe(reqId)

        TransactionContext.set('foo', `_Y_${index}`)
        TransactionContext.set('bar', `_Y_${index}`)

        foo = a.foo()
        expect(foo).toBe(`${rnd}foo_Y_${index}${TransactionContext.reqId}`)
        expect(foo).toBe(`${rnd}foo_Y_${index}${currId}`)

        bar = await a.bar()
        expect(bar).toBe(`${rnd}bar_Y_${index}${TransactionContext.reqId}`)
        expect(bar).toBe(`${rnd}bar_Y_${index}${currId}`)
      }

      await subsub()
    }

    await sub()
  }

  it('Will Preserve Continuation Local State', async () => {
    const tasks = Array(MAX).fill(0).map(async (_, ix) => task(random(), ix))

    await Promise.all(tasks)

    expect(sink.completed).toBe(MAX * TXNS)
  })
})

describe('Run With Context', () => {
  const sink = new RecordingSink()

  beforeAll(() => {
    use(sink)
  })

  const task = async (reqId: string, index: number) => {
    const rnd = random()
    const a = new A(rnd)

    TransactionContext.set('foo', `${index}`)
    TransactionContext.set('bar', `${index}`)

    const sub = async () => {
      let currId = TransactionContext.reqId
      expect(currId).toBe(reqId)

      let foo = a.foo()

      expect(foo).toBe(`${rnd}foo${index}${TransactionContext.reqId}`)
      expect(foo).toBe(`${rnd}foo${index}${currId}`)

      let bar = await a.bar()
      expect(bar).toBe(`${rnd}bar${index}${TransactionContext.reqId}`)
      expect(bar).toBe(`${rnd}bar${index}${currId}`)

      TransactionContext.set('foo', `_X_${index}`)
      TransactionContext.set('bar', `_X_${index}`)

      foo = a.foo()
      expect(foo).toBe(`${rnd}foo_X_${index}${TransactionContext.reqId}`)
      expect(foo).toBe(`${rnd}foo_X_${index}${currId}`)

      bar = await a.bar()
      expect(bar).toBe(`${rnd}bar_X_${index}${TransactionContext.reqId}`)
      expect(bar).toBe(`${rnd}bar_X_${index}${currId}`)

      const subsub = async () => {
        currId = TransactionContext.reqId
        expect(TransactionContext.reqId).toBe(reqId)

        TransactionContext.set('foo', `_Y_${index}`)
        TransactionContext.set('bar', `_Y_${index}`)

        foo = a.foo()
        expect(foo).toBe(`${rnd}foo_Y_${index}${TransactionContext.reqId}`)
        expect(foo).toBe(`${rnd}foo_Y_${index}${currId}`)

        bar = await a.bar()
        expect(bar).toBe(`${rnd}bar_Y_${index}${TransactionContext.reqId}`)
        expect(bar).toBe(`${rnd}bar_Y_${index}${currId}`)
      }

      await subsub()
    }

    await sub()
  }

  it('Will Preserve Continuation Local State', async () => {
    const tasks = Array(MAX).fill(0).map(async (_, ix) => {
      const reqId = random()
      const res = await TransactionContext.run({ reqId }, task, reqId, ix)
      return res
    })

    await Promise.all(tasks)

    expect(sink.completed).toBe(MAX * TXNS)
  })
})
