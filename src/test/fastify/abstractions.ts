import { FastifyRequest, FastifyReply } from 'fastify'

export type FastifyHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

export const enum HttpMethod {
  Get = 'get',
  Put = 'put',
  Post = 'post',
  Patch = 'patch'
}

export type HttpRequest = {
  reqId: string
  query: any
  params: any
  body: any | undefined
}

export type HttpResponse<T = any> = {
  statusCode: number
  data: T
}

export type Handlers = Record<HttpMethod, Array<[path: string, controller: Controller]>>

export abstract class Controller {
  abstract perform (req: HttpRequest): Promise<HttpResponse>
}

const parseFastifyRequestToHttpRequest = (req: FastifyRequest): HttpRequest => {
  const {
    query,
    params,
    body
  } = (req as any)

  return {
    reqId: (req.raw as any).reqId as string,
    query: query as object,
    params: params as object,
    body: body as object | undefined
  }
}

export const adapt = (controller: Controller): FastifyHandler => {
  const fastifyHandler: FastifyHandler = async (request, reply) => {
    const httpRequest = parseFastifyRequestToHttpRequest(request)

    const { statusCode, data } = await controller.perform(httpRequest)

    await reply.code(statusCode).send(data)
  }

  return fastifyHandler
}
