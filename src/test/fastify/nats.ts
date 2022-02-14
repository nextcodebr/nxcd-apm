import { connect, Msg, Payload, Client } from 'ts-nats'
import { Apm } from '../../config'
import natsfyFactory, { Levels, loggerFactory } from '@nextid-core-library/natsfy'
import { route } from '../../integrations/nats'
import { Schema } from 'ajv'
import { TransactionContext } from '../../context/transaction'

const prefix = 'app'

const subjects = {
  managed: 'foo.managed'
}

const prefixed = {
  managed: `${prefix}.${subjects.managed}`
}

const newNatsConnection = async () => {
  const config = {
    servers: ['nats://localhost:4222'],
    payload: Payload.JSON
  }

  const conn = await connect(config)

  return conn
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
export class Consumer {
  client: Client

  constructor (client: Client) {
    this.client = client
  }

  async getMagicNumber () {
    const msg = this.normalize({
      data: {
        reqId: TransactionContext.reqId,
        sha256: 'fake'
      }
    })

    const reply = await this.client.request(prefixed.managed, 60000, msg.data)

    return this.normalizeReply(reply)
  }

  normalize (msg: any) {
    return msg
  }

  normalizeReply (reply: Msg) {
    if (reply?.data?.error) {
      throw reply.data.error
    }

    if (!reply?.data) {
      throw new Error()
    }

    return reply.data as number
  }
}

export const setup = async () => {
  loggerFactory.setActiveLevel(Levels.Debug)
  const conn = await newNatsConnection()
  const natsfy = natsfyFactory(conn, prefix)
  const listener = new Listener()

  const callback = async (msg: Msg) => { return listener.process(msg) }

  await route(natsfy, subjects.managed, s, callback)
}

export const NewConsumer = async () => {
  return new Consumer(await newNatsConnection())
}
