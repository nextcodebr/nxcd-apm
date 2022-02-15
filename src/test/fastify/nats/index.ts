import { spawn, Worker } from 'threads'
import { NatsWorker } from './consumer'

export * from './producer'

export const spawnConsumer = async () => {
  const worker = await spawn<NatsWorker>(new Worker('./consumer'))

  const rv = await worker.start()

  return rv
}
