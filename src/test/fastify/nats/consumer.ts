import { Msg } from 'ts-nats'
import { connect, consumers, subjects } from './share'
import { Schema } from 'ajv'
import natsfyFactory, { Levels, loggerFactory } from '@nextid-core-library/natsfy'
import { Apm } from '../../../config'
import { TransactionContext, use } from '../../../context/transaction'
import { route } from '../../../integrations/nats'
import { expose } from 'threads/worker'
import { threadId } from 'worker_threads'
import { registerSink } from '../mongo'
import { NatsProxySink } from '../../../sink/nats'

const s: Schema = {
  type: 'object',
  additionalProperties: true,
  required: ['sha256'],
  properties: {
    sha256: {
      type: 'string'
    }
  }
}

@Apm.Enable({ sync: true })
class Listener {
  async process (msg: any) {
    this.guard(msg)
    return 42
  }

  guard (msg: any) {
    if (!msg) {
      throw new Error('Invalid Message')
    }
    if (!TransactionContext.reqId) {
      throw new Error('No Transaction')
    }
  }
}

const h = {
  created: false
}

const registerOrProxySink = async (decoupled: boolean) => {
  if (decoupled) {
    const conn = await connect()
    const proxy = new NatsProxySink(conn, subjects.proxy, 1000, 60000)
    use(proxy)
  } else {
    await registerSink()
  }
}

const create = async () => {
  await registerOrProxySink(true)
  const conn = await connect()
  loggerFactory.setActiveLevel(Levels.Debug)
  const natsfy = natsfyFactory(conn, consumers.prefix)
  const listener = new Listener()

  const callback = async (msg: Msg) => { return listener.process(msg) }

  await route(natsfy, consumers.subjects.managed, s, callback)

  return true
}

const Worker = {
  start: async () => {
    const rv = h.created
    if (!rv) {
      h.created = await create()
    }
    return { initialized: h.created, threadId }
  }
}

export type NatsWorker = typeof Worker

expose(Worker)
