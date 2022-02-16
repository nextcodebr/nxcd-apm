import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const isConvertibleArray = (data: any, embedLimit = 64, test?: boolean) => {
  let maybe = data !== undefined && Array.isArray(data) && data.length > embedLimit

  maybe = maybe && (test ? ((data as any[]).findIndex(v => typeof v !== 'number') < 0) : true)

  return maybe
}

export const asBuffer = (v: any, embedLimit = -1) => {
  if (!v) {
    return
  }
  if (Buffer.isBuffer(v) && v.byteLength > embedLimit) {
    return v
  } else if (v.type === 'Buffer' && isConvertibleArray(v.data, embedLimit)) {
    return Buffer.from(v.data)
  } else if (ArrayBuffer.isView(v) && v.byteLength > embedLimit) {
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  } else if (isConvertibleArray(v, embedLimit, true)) {
    return Buffer.from(v)
  }
}

export const isGraph = (obj: any) => {
  return obj && !(obj instanceof Date) && typeof obj === 'object'
}

const store = (buffer: Buffer, handleKey: string, traps: Record<string, Buffer>) => {
  const sha256 = createHash('sha256').update(buffer).digest().toString('hex')

  traps[sha256] = buffer

  return { [handleKey]: sha256 }
}

export interface BufferSink {
  accept: (traps: Record<string, Buffer>) => Promise<string[]>
}

class FSSink implements BufferSink {
  base: string

  constructor (base: string) {
    this.base = base
  }

  async accept (traps: Record<string, Buffer>): Promise<string[]> {
    if (traps) {
      const copies = await Promise.all(Object.entries(traps).map(async ([k, v]) => {
        try {
          const target = join(this.base, k)

          if (existsSync(target)) {
            return k
          }

          await writeFile(target, v)

          return k
        } catch (e) {
          return undefined
        }
      }))

      return copies.filter(k => k !== undefined) as string[]
    }
    return []
  }
}

export const NewSink = (base: string): BufferSink => new FSSink(base)

export const deflate = (obj: any, handleKey: string, traps: Record<string, Buffer>, embedLimit = -1) => {
  if (!obj) {
    return
  }

  if (Array.isArray(obj)) {
    obj = obj.map((v) => deflate(v, handleKey, traps, embedLimit))
  } else {
    const buffer = asBuffer(obj, embedLimit)

    if (buffer) {
      obj = store(buffer, handleKey, traps)
    } else if (isGraph(obj)) {
      obj = Object.entries(obj).reduce((ret: Record<string, any>, [k, v]) => {
        // inline to avoid some recursion
        if (v) {
          if (Array.isArray(v)) {
            v = v.map(p => deflate(p, handleKey, traps, embedLimit))
          } else {
            const b = asBuffer(v, embedLimit)
            if (b) {
              v = store(b, handleKey, traps)
            } else if (isGraph(v)) {
              v = deflate(v, handleKey, traps, embedLimit)
            }
          }
        }
        ret[k] = v
        return ret
      }, {})
    }
  }

  return obj
}
