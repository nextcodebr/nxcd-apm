import { Client, Msg } from 'ts-nats'
import { connect, producers } from './share'
import { Apm } from '../../../config'
import { TransactionContext } from '../../../context/transaction'
import { v4 } from 'uuid'

@Apm.Enable({ sync: true })
export class Producer {
  client: Client

  public static async instance () {
    return new Producer(await connect())
  }

  constructor (client: Client) {
    this.client = client
  }

  async getMagicNumber () {
    const msg = this.normalize({
      data: {
        reqId: TransactionContext.reqId,
        sha256: 'fake',
        buffer: Buffer.from(`fake-buffer-${v4()}`)
      }
    })

    const reply = await this.client.request(producers.subjects.managed, 60000, msg.data)

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
