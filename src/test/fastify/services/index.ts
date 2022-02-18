import { Apm } from '../../../config'
import { delay } from '../../util'
import { Image } from '../payloads'
import { createHash } from 'crypto'

@Apm.Enable()
export class ServiceOne {
  async rotate (image: Image, angle: number) {
    await delay(10)
    return image
  }
}

@Apm.Enable()
export class ServiceTwo {
  producer: { getMagicNumber: () => Promise<number> }

  constructor (consumer: { getMagicNumber: () => Promise<number> }) {
    this.producer = consumer
  }

  async shrink (image: Image, dims: { width: number, height: number }) {
    if (dims.width > 1000) {
      await delay(100)
    } else if (dims.height > 1000) {
      await delay(1000)
    }

    const state = new Sha256State()
    state.set(image.buffer)
    const magic = await this.producer.getMagicNumber()

    if (magic > 0) {
      await delay(magic)
    }

    const buffer = Buffer.alloc(magic).fill(magic)
    state.set(buffer)

    image = { ...image, buffer }

    return { image, magic, token: state.token }
  }
}

@Apm.Enable({ sync: true })
class Sha256State {
  token?: string

  @Apm.Audit()
  set (buffer: Buffer) {
    this.token = createHash('sha256').update(buffer).digest().toString('hex')
  }
}
