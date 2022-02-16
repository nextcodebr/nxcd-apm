import { BufferingSink, ISink } from '../api'
import { MsgCallback, SubscriptionOptions } from 'ts-nats'
import { BridgeOpts } from '../../config/boot'
import { resolve } from './util'

const noop = async <T> (data: any) => data ? data as T[] : undefined

/**
 * Expose sink as a nats listener.
 *
 * Clients without mongo access can use a NatsProxyClient to forward messages to this sink
 *
 */
export const bridge = async<T> (opts: BridgeOpts<T>, sink: ISink<T>) => {
  const { handle, source, revive = noop } = opts

  const client = await resolve(handle)

  const callback: MsgCallback = async (err, msg) => {
    if (!msg.reply) {
      return
    }

    const vals = await revive(msg.data)

    if (vals) {
      if (sink instanceof BufferingSink) {
        await sink.ingest(vals)
      } else {
        vals.forEach(v => sink.accept(v))
      }
    }

    const reply: any = {
      ok: msg.data?.length ?? 0
    }

    if (err) {
      reply.err = err
    }

    await client.publish(msg.reply, reply)
  }

  const subOpts: SubscriptionOptions = { queue: source }

  const sub = await client.subscribe(source, callback, subOpts)

  return sub
}
