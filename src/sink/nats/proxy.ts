import { Client } from 'ts-nats'
import { BufferingSink } from '../api'
import { clearIntervalAsync, setIntervalAsync, SetIntervalAsyncTimer } from 'set-interval-async/dynamic'

export class NatsProxySink<T> extends BufferingSink<T> {
  readonly client: Client
  readonly target: string
  readonly timeout?: number
  timer: SetIntervalAsyncTimer

  constructor (client: Client, target: string, flushInterval: number, timeout?: number) {
    super()
    this.client = client
    this.target = target
    this.timeout = timeout
    this.timer = setIntervalAsync(async () => {
      await this.flush()
    }, flushInterval)
  }

  async ingest (slice: T[]): Promise<void> {
    await this.client.request(this.target, this.timeout, slice)
  }

  async stopAndRestart (flushInterval: number) {
    if (this.timer) {
      await clearIntervalAsync(this.timer)
    }
    this.timer = setIntervalAsync(async () => {
      await this.flush()
    }, flushInterval)
  }
}
