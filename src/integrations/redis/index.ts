import {
  createClient,
  RedisClientType, RedisClientOptions,
  RedisModules, RedisScripts
} from '@node-redis/client'
import { createHash } from 'crypto'
import { asBuffer, isGraph } from '../../share'

export class RedisTransformer {
  static async instance (ttl: number, embedLimit: number, options: RedisClientOptions): Promise<RedisTransformer> {
    const client = await createClient(options)

    return new RedisTransformer(client, ttl, embedLimit)
  }

  readonly client: RedisClientType<RedisModules, RedisScripts>
  readonly ttl: number
  readonly embedLimit: number

  constructor (client: RedisClientType<RedisModules, RedisScripts>, ttl: number, embedLimit: number) {
    this.client = client
    this.ttl = ttl
    this.embedLimit = embedLimit
  }

  async store (buffer: Buffer, traps?: Record<string, Buffer>) {
    await this.check()
    const sha256 = createHash('sha256').update(buffer).digest().toString('hex')

    if (!traps || !traps[sha256]) {
      const reply = await this.client.set(sha256, buffer.toString('base64'), { EX: this.ttl })

      if (reply !== 'OK') {
        throw new Error()
      }
    }

    if (traps) {
      traps[sha256] = buffer
    }

    return { redisHandle: sha256 }
  }

  async deflate (obj: any, traps?: Record<string, Buffer>) {
    if (!obj) {
      return
    }

    if (Array.isArray(obj)) {
      const tmp = await Promise.all(obj.map(async (v) => await this.deflate(v, traps)))
      obj = tmp
    } else {
      const buffer = asBuffer(obj, this.embedLimit)

      if (buffer) {
        obj = await this.store(buffer, traps)
      } else if (isGraph(obj)) {
        const flat = await Promise.all(Object.entries(obj).map(async ([k, v]) => {
          // inline to avoid some recursion
          if (v) {
            if (Array.isArray(v)) {
              v = await Promise.all(v.map(async (p) => await this.deflate(p, traps)))
            } else {
              const b = asBuffer(v, this.embedLimit)
              if (b) {
                v = await this.store(b)
              } else if (isGraph(v)) {
                v = await this.deflate(v, traps)
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

  async inflate (obj: any, traps?: Record<string, Buffer>) {
    if (!obj) {
      return
    }

    if (Array.isArray(obj)) {
      obj = await Promise.all(obj.map(async (v) => await this.inflate(v, traps)))
    } else {
      const key = obj.redisHandle

      if (key) {
        obj = await this.find(key, traps)
      } else if (isGraph(obj)) {
        const flat = await Promise.all(Object.entries(obj).map(async ([k, v]) => {
          if (v) {
            // inline to avoid some recursion
            if (Array.isArray(v)) {
              v = await Promise.all(v.map(async (p) => await this.inflate(p, traps)))
            } else {
              const k = (v as any).redisHandle
              if (k) {
                v = await this.find(k)
              } else if (isGraph(v)) {
                v = await this.inflate(v, traps)
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

  async find (key: string, traps?: Record<string, any>) {
    let v = traps ? traps[key] : undefined

    if (!v) {
      await this.check()
      v = await this.client.get(key)
    }

    return v ? Buffer.from(v, 'base64') : undefined
  }

  private async check () {
    if (!this.client.isOpen) {
      await this.client.connect()
    }
  }
}
