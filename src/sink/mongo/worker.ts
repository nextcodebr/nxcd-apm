import { MongoClient, Collection } from 'mongodb'
import { Transaction } from '../../context/transaction'
import { expose } from 'threads/worker'
import { DLQ } from '../dlq'
import { threadId, workerData } from 'worker_threads'

type Handles = {
  client?: MongoClient
  collection?: Collection<Transaction>
  dlq?: DLQ
  runs: number
}

const H: Handles = {
  runs: 0
}

const resolve = async () => {
  let c = H.collection

  if (!c) {
    const config: { url: string, dbname: string, collection: string } = workerData
    let cli = H.client
    if (!cli) {
      cli = H.client = await MongoClient.connect(config.url, {
        connectTimeoutMS: 1000,
        minPoolSize: 1,
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 5000
      })
    }
    c = H.collection = cli.db(config.dbname).collection(config.collection)
  }

  return c
}

const disconnect = async () => {
  H.collection = undefined
  const cli = H.client
  if (cli) {
    H.client = undefined
    try {
      await cli.close()
    } catch (e) {
      console.log(e)
    }
  }
}

const lazyDLQ = () => {
  let rv = H.dlq
  if (!rv) {
    rv = H.dlq = new DLQ({ prefix: `${threadId}` })
  }
  return rv
}

const Worker = {
  flush: async (transactions: Transaction[]) => {
    try {
      const collection = await resolve()
      const buffer = await collection.insertMany(transactions)
      const recovered = await processDLQ(collection, (++H.runs % 60 === 0))

      return { buffer, dlq: recovered }
    } catch (e) {
      lazyDLQ().accept(...transactions)
      await disconnect()
      throw e
    }
  },
  doDLQ: async () => {
    try {
      const collection = await resolve()
      const res = await processDLQ(collection, true)

      return { dlq: res }
    } catch (e) {
      await disconnect()
      throw e
    }
  }
}

const processDLQ = async (collection: Collection<Transaction>, force?: boolean) => {
  let dlq = H.dlq
  if (!dlq && force) {
    dlq = lazyDLQ()
  }

  if (!dlq) {
    return
  }

  let batches: Array<{ file: string, txns: Transaction[] }> = []
  let count = 0

  for await (const batch of dlq.list()) {
    batches.push(batch)
    count += batch.txns.length
    if (count >= 50) {
      await collection.insertMany(batches.flatMap(batch => batch.txns))
      count = 0
      batches = []

      dlq.prune(batches.map(batch => batch.file))
    }
  }

  if (batches.length) {
    const res = await collection.insertMany(batches.flatMap(batch => batch.txns))
    dlq.prune(batches.map(batch => batch.file))
    return res
  }
}

export type MongoWorker = typeof Worker

expose(Worker)
