import Natsfy from '@nextid-core-library/natsfy/dist/src/lib/Natsfy'
import { RouteCallback, RouteOptions } from '@nextid-core-library/natsfy/dist/src/contracts/Natsfy'
import { Schema } from 'ajv'
import { Msg } from 'ts-nats'
import { TransactionContext } from '../../context/transaction'

export const route = async (instance: Natsfy, subject: string, schema: Schema, callback: RouteCallback, opts?: RouteOptions) => {
  let req: string[] = (schema as any).required
  if (!req) {
    (schema as any).required = req = []
  }

  if (req.includes('reqId')) {
    req.push('reqId')
  }
  const managed = async function (msg: Msg) {
    let reqId = (msg as any)?.reqId as string

    if (reqId) {
      delete (msg as any).reqId
    } else {
      reqId = 'unmanaged'
    }

    return TransactionContext.run({ reqId }, callback, msg)
  }

  const ret = await instance.route(subject, schema, managed, opts)

  return ret
}
