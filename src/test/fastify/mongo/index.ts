import { NewSink } from '../../../sink/mongo/master'
import { use } from '../../../context/transaction'
import { bridge } from '../../../sink/nats'
import { subjects, connect } from '../nats'

export const registerSink = async (exposeBridge?: boolean) => {
  const sink = NewSink({ mongo: { url: 'mongodb://localhost:27017', dbname: 'diagnostics', collection: 'txn_logs' }, workers: 4 })
  use(sink)

  if (exposeBridge) {
    const client = await connect()
    await bridge(client, subjects.proxy, sink)
  }
}