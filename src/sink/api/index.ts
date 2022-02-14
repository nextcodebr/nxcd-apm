export interface ISink<T> {
  accept: (obj: T) => void
}

export const BlackHole = <T> (): ISink<T> => {
  return {
    accept: (obj: T): void => {

    }
  }
}
