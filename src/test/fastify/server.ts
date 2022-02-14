import { Apm } from '../../config'
import { TransactionContext, use } from '../../context/transaction'
import { NewSink } from '../../sink/mongo/master'
import middie from 'middie'
import Fastify, { FastifyInstance } from 'fastify'
import { v4 } from 'uuid'
import { adapt, Controller, Handlers, HttpMethod, HttpRequest, HttpResponse } from './abstractions'
import { ServiceOne, ServiceTwo } from './services'
import { Image } from './payloads'

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
  readonly second = new ServiceTwo()

  @Apm.EntryPoint(defaultExtract, { label: 'receiveImage' })
  async perform (req: HttpRequest): Promise<HttpResponse<any>> {
    const image: Image = { buffer: Buffer.alloc(100) }

    const rotated = await this.first.rotate(image, 90)

    const shrinked = await this.second.shrink(rotated, { width: 100, height: 10000 })

    return ok(shrinked)
  }
}

const handlers: Handlers = {
  [HttpMethod.Post]: [
    ['/app', new AppController()],
    ['/img', new ImgController()]
  ],
  [HttpMethod.Get]: [],
  [HttpMethod.Patch]: [],
  [HttpMethod.Put]: []
}

const start = async () => {
  use(NewSink({ mongo: { url: 'mongodb://localhost:27017', dbname: 'diagnostics', collection: 'txn_logs' } }))

  await app.register(middie)

  app.use((req, res, next) => {
    req.reqId = v4()

    next()
  })

  for (const [m, h] of Object.entries(handlers)) {
    for (const [path, controler] of h) {
      app[m as HttpMethod](path, adapt(controler))
    }
  }

  await app.listen(8080)
  console.log('Server started')
}

(
  async () => await start()
)().finally(() => { })
