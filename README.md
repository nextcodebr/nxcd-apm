# nxcd-apm

Declarative performance and state tracking

### Usage

This library captures state of service methods and records it as a *Transaction*

```typescript
class Transaction {
  type: string
  method: string
  reqId?: string
  input?: any
  output?: any
  error: any
  started?: Date
  finished?: Date
  took?: number
  status?: Status
}
```

When a class is declared with @Apm.Enable, all asynchronous methods will be instrumented to behave like

```typescript

instrumented_method(state:any) {
  const txn = begin(...)
  txn.captureInput(state)
  try{
    const ret = await method(state)
    txn.end(ret);
  } catch(e){
    txn.error(e)
    throw e
  }
}

```

```
@Apm.Enable()
class Service {

  async compute(state: any) {
    ...
  }
}
```

### EntryPoints

EntryPoints are root methods upon which the RequestId is bound and the Transactional Context is initialized. 

The call graph followed by an EntryPoint will be able to access the RequestId from an AsyncLocalStorage

```
// Top Layer binds reqId to http-request
const middleware = (req,res,next)=>{
  req.params.reqId = uuid()
  
  next()
}

@Apm.Enable()
class Controller {

  serviceOne: ServiceOne
  serviceTwo: ServiceTwo

  // entry point must tell how to extract requestId to bind to Transactional Context
  @Apm.EntryPoint((req: HttpRequest) => req.params.reqId)
  async perform(req: HttpRequest) {
    const state = convertToDomainObject(req)
    const parsed = await serviceOne.execute(state)
    const result = await serviceTwo.execute(parsed)
  
    return result
  }
}

@Apm.Enable()
class ServiceOne {
  async execute(state: any) {
    const reqId = TransactionalContext.reqId // captures reqId, no need to pass to every method as parameter
  }
}
```
