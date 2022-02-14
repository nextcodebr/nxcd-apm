import { Apm } from '@/config'
import { TransactionContext, use } from '@/context/transaction'
import { RecordingSink } from '../share'
import { delay } from '@/test/util'

@Apm.Enable({ sync: true })
class AuthorizizationService {
  async exists (userId: string) {
    await delay(1000)
    return userId === 'admin'
  }

  isLogged () {
    return TransactionContext.get('userId') !== undefined
  }
}

@Apm.Enable({ sync: true })
class RotateService {
  rotate (buff: Buffer) {
    return this.prepare(buff)
  }

  prepare (buff: Buffer) {
    return buff
  }
}

@Apm.Enable()
class ClassifyService {
  classify (buff: Buffer) {
    return buff
  }
}

const authService = new AuthorizizationService()
const rotateService = new RotateService()
const classifyService = new ClassifyService()

const first = async (req: any, res: any, next: () => Promise<void>) => {
  if (authService.isLogged()) {
    throw new Error('Should not be logged')
  }

  const exists = await authService.exists(req.userId as string)
  if (!exists) {
    throw new Error('')
  }
  TransactionContext.set('userId', req.userId as string)

  await next()
}

const second = async (req: any, res: any, next: () => Promise<void>) => {
  if (!authService.isLogged()) {
    throw new Error('Should already be logged')
  }

  req.rotated = rotateService.rotate(req.buffer as Buffer)

  await next()
}

const third = async (req: any, res: any, next: () => Promise<void>) => {
  if (!authService.isLogged()) {
    throw new Error('Should already be logged')
  }

  req.classified = await classifyService.classify(req.rotated as Buffer)

  await next()
}

describe('', () => {
  const sink = new RecordingSink()

  beforeAll(() => {
    use(sink)
  })

  it('', async () => {
    const wrapped = TransactionContext.wrapAsync(first, (req: any) => req.requestId as string)

    const req = { requestId: '1', userId: 'admin' }
    const res = {}

    await wrapped(req, res, async () => { await second(req, res, async () => await third(req, res, async () => { })) })

    expect(sink.completed).toBe(6)
  })
})
