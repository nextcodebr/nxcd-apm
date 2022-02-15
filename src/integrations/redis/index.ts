import {
  createClient,
  RedisClientType, RedisClientOptions,
  RedisModules, RedisScripts
} from '@node-redis/client'
import { createHash } from 'crypto'

const asBuffer = (v: any) => {
  if (!v) {
    return
  }
  if (Buffer.isBuffer(v)) {
    return v
  } else if (v.type === 'Buffer' && v.data && Array.isArray(v.data)) {
    return Buffer.from(v.data)
  }
}

export class RedisTransformer {
  static async instance (ttl: number, options: RedisClientOptions): Promise<RedisTransformer> {
    const client = await createClient(options)

    return new RedisTransformer(client, ttl)
  }

  readonly client: RedisClientType<RedisModules, RedisScripts>
  readonly ttl: number

  constructor (client: RedisClientType<RedisModules, RedisScripts>, ttl: number) {
    this.client = client
    this.ttl = ttl
  }

  async store (buffer: Buffer) {
    await this.check()
    const sha256 = createHash('sha256').update(buffer).digest().toString('hex')

    const reply = await this.client.set(sha256, buffer.toString('base64'), { EX: this.ttl })

    if (reply !== 'OK') {
      throw new Error()
    }

    return { redisHandle: sha256 }
  }

  async deflate (obj: any) {
    if (!obj) {
      return
    }

    if (Array.isArray(obj)) {
      const tmp = await Promise.all(obj.map(async (v) => await this.deflate(v)))
      obj = tmp
    } else {
      const buffer = asBuffer(obj)

      if (buffer) {
        obj = await this.store(buffer)
      } else if (typeof obj === 'object') {
        const flat = await Promise.all(Object.entries(obj).map(async ([k, v]) => {
          if (v) {
            if (Array.isArray(v)) {
              v = await Promise.all(v.map(async (p) => await this.deflate(p)))
            } else {
              const b = asBuffer(v)
              if (b) {
                v = await this.store(b)
              } else if (typeof v === 'object') {
                v = await this.deflate(v)
              }
            }
          }
          return { k, v }
        }))

        for (const { k, v } of flat) {
          obj[k] = v
        }
      }
    }

    return obj
  }

  async inflate (obj: any) {
    if (!obj) {
      return
    }

    if (Array.isArray(obj)) {
      obj = await Promise.all(obj.map(async (v) => await this.inflate(v)))
    } else {
      const key = obj.redisHandle

      if (key) {
        obj = await this.find(key)
      } else if (typeof obj === 'object') {
        const flat = await Promise.all(Object.entries(obj).map(async ([k, v]) => {
          if (v) {
            if (Array.isArray(v)) {
              v = await Promise.all(v.map(async (p) => await this.inflate(p)))
            } else {
              const k = (v as any).redisHandle
              if (k) {
                v = await this.find(k)
              } else if (typeof v === 'object') {
                v = await this.inflate(v)
              }
            }
          }
          return { k, v }
        }))

        for (const { k, v } of flat) {
          obj[k] = v
        }
      }
    }

    return obj
  }

  async find (key: string) {
    await this.check()
    const v = await this.client.get(key)

    return v ? Buffer.from(v, 'base64') : undefined
  }

  private async check () {
    if (!this.client.isOpen) {
      await this.client.connect()
    }
  }
}
