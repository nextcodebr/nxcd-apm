import { BufferingSink, ISink } from '../api'
import { Client, connect, NatsConnectionOptions, MsgCallback, SubscriptionOptions } from 'ts-nats'

const noop = async <T> (data: any) => data ? data as T[] : undefined

/**
 * Expose sink as a nats listener.
 *
 * Clients without mongo access can use a NatsProxyClient to forward messages to this sink
 *
 */
export const bridge = async<T> (handle: NatsConnectionOptions | Client, source: string, sink: ISink<T>, revive: (data: any) => Promise<T[] | undefined> = noop) => {
  let client: Client
  if (handle instanceof Client) {
    client = handle
  } else {
    client = await connect(handle)
  }

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

  const opts: SubscriptionOptions = { queue: source }

  const sub = await client.subscribe(source, callback, opts)

  return sub
}
