export interface ISink<T> {
  accept: (obj: T) => void
}

export abstract class BufferingSink<T> implements ISink<T> {
  protected buffer: T[]

  constructor () {
    this.buffer = []
  }

  accept (obj: T) {
    this.buffer.push(obj)
  }

  acceptAll (vals: T[]) {
    this.buffer = this.buffer.concat(vals)
  }

  async flush (): Promise<void> {
    const len = this.buffer.length
    if (len > 0) {
      const copy = this.buffer.splice(0, len)
      await this.ingest(copy)
    }
  }

  abstract ingest (slice: T[]): Promise<void>
}

export const BlackHole = <T> (): ISink<T> => {
  return {
    accept: (obj: T): void => {

    }
  }
}
