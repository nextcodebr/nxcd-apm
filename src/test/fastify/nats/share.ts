import { connect as conn, Payload } from 'ts-nats'

const prefix = 'app'

export const subjects = {
  managed: 'foo.managed',
  proxy: 'sink.proxy'
}

const prefixed = {
  managed: `${prefix}.${subjects.managed}`
}

export const consumers = {
  prefix,
  subjects
}

export const producers = {
  subjects: prefixed
}

export const connect = async () => {
  const config = {
    servers: ['nats://localhost:4222'],
    payload: Payload.JSON
  }

  const client = await conn(config)

  return client
}
