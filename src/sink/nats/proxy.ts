import { Client, NatsConnectionOptions } from 'ts-nats'
import { BufferingSink } from '../api'
import { clearIntervalAsync, setIntervalAsync, SetIntervalAsyncTimer } from 'set-interval-async/dynamic'
import { NatsProxySinkConnfig as Opts } from '../../config/boot'
import { resolve } from './util'

export class NatsProxySink<T> extends BufferingSink<T> {
  readonly client: Client
  readonly opts: Opts<T>
  timerId: SetIntervalAsyncTimer

  static async instance<V> (handle: NatsConnectionOptions | Client, opts: Opts<V>) {
    const client = await resolve(handle)

    return new NatsProxySink(client, opts)
  }

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
