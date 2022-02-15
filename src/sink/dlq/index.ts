import { existsSync, mkdirSync, writeFileSync, promises, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { v4 } from 'uuid'

type Serializer = {
  serialize: <T>(txns: T[]) => Buffer
  deserialize: <T>(src: Buffer) => T[]
}

const def: Serializer = {
  serialize: <T> (txns: T[]) => Buffer.from(JSON.stringify(txns)),
  deserialize: <T> (src: Buffer) => JSON.parse((src as unknown) as string) as T[]
}

export class DLQ<T> {
  private readonly base: string
  private readonly serializer: Serializer

  constructor (config?: { base?: string, prefix?: string, serializer?: Serializer }) {
    let base = config?.base ?? join(__dirname, 'dlq')
    base = config?.prefix ? join(base, config.prefix) : base

    if (!existsSync(base)) {
      mkdirSync(base, { recursive: true })
    }

    this.base = base

    this.serializer = config?.serializer ?? def
  }

  accept (...txns: T[]) {
    const target = join(this.base, v4())

    writeFileSync(target, this.serializer.serialize(txns))
  }

  async * list () {
    const files = await promises.readdir(this.base).then(files => files)

    for (const file of files) {
      const abs = join(this.base, file)
      yield { file: abs, txns: this.serializer.deserialize<T>(readFileSync(abs)) }
    }
  }

  prune (files: string[]) {
    for (const file of files) {
      rmSync(file)
    }
  }
}
