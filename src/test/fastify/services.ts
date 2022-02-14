import { Apm } from '../../config'
import { delay } from '../util'
import { Image } from './payloads'

@Apm.Enable()
export class ServiceOne {
  async rotate (image: Image, angle: number) {
    await delay(10)
    return image
  }
}

@Apm.Enable()
export class ServiceTwo {
  async shrink (image: Image, dims: { width: number, height: number }) {
    if (dims.width > 1000) {
      await delay(100)
    } else if (dims.height > 1000) {
      await delay(1000)
    }

    return image
  }
}
