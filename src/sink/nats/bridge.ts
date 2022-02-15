import { BufferingSink, ISink } from '../api'
import { Client, connect, NatsConnectionOptions, MsgCallback, SubscriptionOptions } from 'ts-nats'

export const bridge = async <T> (handle: NatsConnectionOptions | Client, source: string, sink: ISink<T>) => {
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

    if (msg.data) {
      const vals = msg.data as T[]
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
