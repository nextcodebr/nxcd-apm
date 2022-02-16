import { Client, connect, NatsConnectionOptions } from 'ts-nats'

export const resolve = async (handle: NatsConnectionOptions | Client) => {
  let client: Client

  if (handle instanceof Client) {
    client = handle
  } else {
    client = await connect(handle)
  }

  return client
}
