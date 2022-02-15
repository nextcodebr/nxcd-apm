import { Apm } from '../../../config'
import { delay } from '../../util'
import { Image } from '../payloads'

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

    const magic = await this.producer.getMagicNumber()

    if (magic > 0) {
      await delay(magic)
    }

    image = { ...image, buffer: Buffer.alloc(magic) }

    return { image, magic }
  }
}
