import { Session } from 'inspector'
import { promisify } from 'util'

type Handle = {
  session?: Session
  post?: any
  scripts: Record<string, any>
  seq: number
}

const h: Handle = {
  scripts: {},
  seq: 0
}

const PREFIX = '__functionLocation__'

const id = () => {
  return `${++h.seq}`
}

const connect = async () => {
  if (!h.session) {
    const session = new Session()

    const post = promisify(session.post).bind(session) as any

    session.connect()

    session.on('Debugger.scriptParsed', (res) => {
      h.scripts[res.params.scriptId] = res.params
    })

    await post('Debugger.enable')
    h.session = session
    h.post = post
  }
}

const done = async (uuid: string) => {
  if (!h.post) {
    return
  }
  await h.post('Runtime.releaseObjectGroup', {
    objectGroup: PREFIX
  })

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (global as any)[PREFIX][uuid]
}

const g: any = global as any

export const locate = async (fn: Function) => {
  const uuid = id()
  g[PREFIX] = (g[PREFIX] || (g[PREFIX] = {}))
  g[PREFIX][uuid] = fn
  await connect()
  try {
    const evaluated = await h.post('Runtime.evaluate', {
      expression: `global.${PREFIX}['${uuid}']`,
      objectGroup: PREFIX
    })

    const properties = await h.post('Runtime.getProperties', {
      objectId: evaluated.result.objectId
    })

    const location = properties.internalProperties.find((prop: any) => prop.name === '[[FunctionLocation]]')

    return location
  } catch (e) {
    console.error(e)
  } finally {
    await done(uuid)
  }
}
