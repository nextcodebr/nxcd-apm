import { BufferSink } from '../../share/deflater'
import { Collection, MongoClient } from 'mongodb'

export class MongoDeflateSink implements BufferSink {
  collection: Collection

  constructor (client: MongoClient, dbname: string, collection: string) {
    this.collection = client.db(dbname).collection(collection)
  }

  async accept (traps: Record<string, Buffer>): Promise<string[]> {
    if (traps) {
      const keys = Object.keys(traps)

      if (keys.length) {
        // cheaper to query first since buffers are large to ship over network
        const existing = (await (await this.collection.find({ key: { $in: keys } }, { projection: { key: 1 } })).toArray()).map(v => v.key as string)
        const ok = [...existing]
        const values = Object.entries(traps).filter(([k, _]) => !ok.includes(k)).map(([k, v]) => { return { key: k, buffer: v } })

        if (values.length) {
          for (const v of values) {
            const r = await this.collection.updateOne({ key: v.key }, { $set: v }, { upsert: true })
            if (r?.acknowledged) {
              ok.push(v.key)
            }
          }
        }

        return ok
      }
    }
    return []
  }
}
