import { NewSink } from '../../../sink/mongo/master'
import { use } from '../../../context/transaction'

export const registerSink = () => {
  use(NewSink({ mongo: { url: 'mongodb://localhost:27017', dbname: 'diagnostics', collection: 'txn_logs' } }))
}
