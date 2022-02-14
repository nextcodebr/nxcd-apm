export const delay = async (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
