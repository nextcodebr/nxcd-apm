import { Client } from 'ts-nats'
import { BufferingSink } from '../api'
import { clearIntervalAsync, setIntervalAsync, SetIntervalAsyncTimer } from 'set-interval-async/dynamic'

type Opts<T> = {
  target: string
  flushInterval: number
  timeout?: number
  deflate?: (data: T[]) => Promise<any>
}

export class NatsProxySink<T> extends BufferingSink<T> {
  readonly client: Client
  readonly opts: Opts<T>
  timerId: SetIntervalAsyncTimer

  constructor (client: Client, opts: Opts<T>) {
    super()
    this.client = client
    this.opts = opts
    this.timerId = setIntervalAsync(async () => {
      await this.flush()
    }, opts.flushInterval)
  }

  async ingest (slice: T[]): Promise<void> {
    let data: any = slice

    if (this.opts.deflate) {
      data = await this.opts.deflate(slice)
    }

    await this.client.request(this.opts.target, this.opts.timeout, data)
  }

  async stopAndRestart (flushInterval: number) {
    if (this.timerId) {
      await clearIntervalAsync(this.timerId)
    }
    this.timerId = setIntervalAsync(async () => {
      await this.flush()
    }, flushInterval)
  }
}
