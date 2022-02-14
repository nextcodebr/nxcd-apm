import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'
import { delay } from '@/test/util'

const sink = new RecordingSink()

use(sink)

const extractReqId = (req: Record<string, any>) => req.reqId as string

@Apm.Enable({ sync: true })
class A {
  @Apm.EntryPoint(extractReqId)
  foo (req: Record<string, any>, res: Record<string, any>) {
    if (req.reqId !== TransactionContext.reqId) {
      throw new Error()
    }
    return TransactionContext.reqId
  }

  @Apm.EntryPoint(extractReqId)
  async bar (req: Record<string, any>, res: Record<string, any>) {
    if (req.reqId !== TransactionContext.reqId) {
      throw new Error()
    }
    await delay(100)
    return TransactionContext.reqId
  }
}

describe('Test', () => {
  it('Ble', async () => {
    const a = new A()

    let v = a.foo({ reqId: '1' }, {})

    expect(v).toBe('1')

    expect(sink.pop().reqId).toBe('1')

    v = await a.bar({ reqId: '2' }, {})

    expect(v).toBe('2')

    const txn = sink.pop()
    expect(txn.reqId).toBe('2')
    expect(txn.took).toBeGreaterThan(50)
  })
})
