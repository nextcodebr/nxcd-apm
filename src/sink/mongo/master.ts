import { spawn, Pool, Worker, ModuleThread } from 'threads'
import { Transaction } from '../../context/transaction'
import { setIntervalAsync } from 'set-interval-async/dynamic'
import { ISink } from '../api'
import { MongoWorker } from './worker'

type Config = {
  mongo: {
    url: string
    dbname: string
    collection: string
  }
  workers?: number
  maxQueued?: number
}

const constrain = (value: number | undefined, def: number) => {
  value = value ?? def
  return value > 0 ? value : def
}

class MongoSink implements ISink<Transaction> {
  runs: number = 0
  config: Config
  buffer: Transaction[]
  pool: Pool<ModuleThread<MongoWorker>>

  constructor (config: Config) {
    this.config = config
    this.buffer = []
    setIntervalAsync(async () => {
      await this.flush().catch(e => {

      })
    }, 1000)

    const [size, maxQueuedJobs] = [constrain(config.workers, 1), constrain(config.maxQueued, 1)]

    this.pool = Pool(async () => spawn<MongoWorker>(new Worker('./worker', {
      workerData: config.mongo
    })), { size, maxQueuedJobs, concurrency: 1 })
  }

  accept (txn: Transaction): void {
    this.buffer.push(txn)
  }

  async flush (): Promise<void> {
    const len = this.buffer.length
    if (len > 0) {
      const copy = this.buffer.splice(0, len)
      try {
        const done = await this.pool.queue(async (worker: MongoWorker) => {
          const rv = await worker.flush(copy)
          return rv
        })
        console.log(`Flushed ${JSON.stringify(done)}`)
      } catch (e) {
        console.log(e)
      }

      ++this.runs
    }
  }
}

export const NewSink = (config: Config): ISink<Transaction> => {
  return new MongoSink(config)
}
