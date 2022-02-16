import { Client, NatsConnectionOptions } from 'ts-nats'

export type DeflateTarget = { embedLimit: number } & (
  { mongo: { dbname: string, collection: string } } |
  { fs: { base: string } } |
  { minio: { url: string } }
)

export type BridgeOpts<T> = {
  handle: NatsConnectionOptions | Client
  source: string
  revive?: (data: any) => Promise<T[] | undefined>
}

export type MongoSinkConfig<T> = {
  mongo: {
    url: string
    dbname: string
    collection: string
  }
  deflate?: DeflateTarget
  workers?: number
  maxQueued?: number
  bridgify?: BridgeOpts<T>
}

export type NatsProxySinkConnfig<T> = {
  target: string
  flushInterval: number
  timeout?: number
  deflate?: (data: T[]) => Promise<any>
}
