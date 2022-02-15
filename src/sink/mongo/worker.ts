import { MongoClient, Collection } from 'mongodb'
import { expose } from 'threads/worker'
import { DLQ } from '../dlq'
import { threadId, workerData } from 'worker_threads'
import { DeflateTarget, NewSink, BufferSink, deflate } from '../../share'
import { MongoDeflateSink } from './deflate'

type Handles<T> = {
  client?: MongoClient
  collection?: Collection<any>
  sink?: BufferSink
  dlq?: DLQ<T>
  runs: number
  embedLimit: number
}

type WorkerConfig = {
  mongo: { url: string, dbname: string, collection: string }
  deflate?: DeflateTarget
}

const H: Handles<any> = {
  runs: 0,
  embedLimit: -1
}

const handle = <T> () => H as Handles<T>

const sinkFor = (target?: DeflateTarget) => {
  let sink
  if (target) {
    const def = target as any
    H.embedLimit = target.embedLimit
    if (def.mongo) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sink = new MongoDeflateSink(H.client!, def.mongo.dbname, def.mongo.collection)
    } else if (def.fs) {
      sink = NewSink(def.fs)
    } else if (def.minio) {
      // TODO minio
      sink = undefined
    }

    return sink
  }
}

const resolve = async () => {
  let c = H.collection

  if (!c) {
    const config: WorkerConfig = workerData
    let cli = H.client
    if (!cli) {
      cli = H.client = await MongoClient.connect(config.mongo.url, {
        connectTimeoutMS: 1000,
        minPoolSize: 1,
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 5000
      })
    }
    c = H.collection = cli.db(config.mongo.dbname).collection(config.mongo.collection)

    if (!H.sink) {
      H.sink = sinkFor(config.deflate)
    }
  }

  return c
}

const disconnect = async () => {
  H.collection = undefined
  const cli = H.client
  if (cli) {
    H.client = undefined
    H.sink = undefined
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

const prepare = <T> (objs: T[]) => {
  let traps
  if (H.sink) {
    objs = deflate(objs, '__handle__', traps = {}, H.embedLimit)
  }
  return { objs, traps }
}

const bulkInsert = async <T> (collection: Collection, transactions: T[]) => {
  const prep = prepare<T>(transactions)
  let deflated = 0
  if (H.sink && prep.traps) {
    deflated = (await H.sink.accept(prep.traps)).length
  }
  const inserts = await collection.insertMany(prep.objs)
  return { threadId, inserts, deflated }
}

const Worker = {
  flush: async <T> (transactions: T[]) => {
    try {
      const collection = await resolve()
      const res = await bulkInsert(collection, transactions)

      let dlq
      if ((++H.runs % 60 === 0)) {
        dlq = await processDLQ(collection, true)
      }

      return { ...res, dlq }
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

const processDLQ = async <T> (collection: Collection<any>, force?: boolean) => {
  let dlq = handle<T>().dlq
  if (!dlq && force) {
    dlq = lazyDLQ()
  }

  if (!dlq) {
    return
  }

  let batches: Array<{ file: string, txns: T[] }> = []
  let count = 0

  for await (const batch of dlq.list()) {
    batches.push(batch)
    count += batch.txns.length
    if (count >= 50) {
      const txns = batches.flatMap(batch => batch.txns)
      await bulkInsert(collection, txns)
      dlq.prune(batches.map(batch => batch.file))

      count = 0
      batches = []
    }
  }

  if (batches.length) {
    const txns = batches.flatMap(batch => batch.txns)
    const res = await bulkInsert(collection, txns)
    dlq.prune(batches.map(batch => batch.file))
    return res.inserts
  }
}

export type MongoWorker = typeof Worker

expose(Worker)
