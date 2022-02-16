import { NewSink } from '../../../sink/mongo/master'
import { use, Transaction } from '../../../context/transaction'
import { bridge } from '../../../sink/nats'
import { subjects, connect } from '../nats'
import { RedisTransformer } from '../../../integrations/redis'
import { opts } from '../redis/share'
import { restoreDate } from '../../../share'

const newInflater = async () => {
  const transformer = await RedisTransformer.instance(60, 64, opts)

  return async (data: any) => {
    if (data && Array.isArray(data)) {
      const result = await Promise.all(data.map(async v => {
        const txn = Object.setPrototypeOf(await transformer.inflate(v), Transaction.prototype) as Transaction
        return restoreDate(txn, 'started', 'finished')
      }))

      data = result
    }

    return data
  }
}

export const registerSink = async (exposeBridge?: boolean) => {
  const sink = NewSink<Transaction>({
    mongo: { url: 'mongodb://localhost:27017', dbname: 'diagnostics', collection: 'txn_logs' },
    deflate: { embedLimit: 64, mongo: { dbname: 'diagnostics', collection: 'buffers' } },
    workers: 4
  })
  use(sink)

  if (exposeBridge) {
    const inflate = await newInflater()
    const client = await connect()
    await bridge({ handle: client, source: subjects.proxy, revive: inflate }, sink)
  }
}
