import { Apm } from '../../config'
import { TransactionContext } from '../../context/transaction'
import middie from 'middie'
import Fastify, { FastifyInstance } from 'fastify'
import { v4 } from 'uuid'
import { adapt, Controller, Handlers, HttpMethod, HttpRequest, HttpResponse } from './abstractions'
import { ServiceOne, ServiceTwo } from './services'
import { Image } from './payloads'
import { Producer, spawnConsumer } from './nats'
import { registerSink } from './mongo'

const app: FastifyInstance = Fastify()

const defaultExtract = (req: HttpRequest) => req.reqId

const ok = <T = any> (data: T): HttpResponse<T> => ({
  statusCode: 200,
  data
})

@Apm.Enable({ sync: true })
class AppController extends Controller {
  readonly token: string = 'FooBar'

  @Apm.EntryPoint(defaultExtract, { exclude: true })
  async perform (req: HttpRequest): Promise<HttpResponse<any>> {
    const payload = { time: new Date(), reqId: TransactionContext.reqId }

    return ok(this.process(payload))
  }

  process (payload: any) {
    return { token: this.token, ...payload }
  }
}

@Apm.Enable()
class ImgController extends Controller {
  readonly first = new ServiceOne()
  readonly second: ServiceTwo

  constructor (second: ServiceTwo) {
    super()
    this.second = second
  }

  @Apm.EntryPoint(defaultExtract, { label: 'receiveImage' })
  async perform (req: HttpRequest): Promise<HttpResponse<any>> {
    const image: Image = { buffer: Buffer.alloc(100) }

    const rotated = await this.first.rotate(image, 90)

    const shrinked = await this.second.shrink(rotated, { width: 100, height: 10000 })

    return ok(shrinked)
  }
}

const start = async () => {
  registerSink()

  await app.register(middie)

  app.use((req, res, next) => {
    req.reqId = v4()

    next()
  })

  const producer = await Producer.instance()

  const handlers: Handlers = {
    [HttpMethod.Post]: [
      ['/app', new AppController()],
      ['/img', new ImgController(new ServiceTwo(producer))]
    ],
    [HttpMethod.Get]: [],
    [HttpMethod.Patch]: [],
    [HttpMethod.Put]: []
  }

  for (const [m, h] of Object.entries(handlers)) {
    for (const [path, controler] of h) {
      app[m as HttpMethod](path, adapt(controler))
    }
  }

  const workerStatus = await spawnConsumer()

  console.log(`Nats Listener: ${JSON.stringify(workerStatus)}`)

  await app.listen(8080)
  console.log('Server started')
}

(
  async () => await start()
)().finally(() => { })
