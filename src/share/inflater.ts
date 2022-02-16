
export const restoreDate = <T> (obj: T, ...fields: Array<keyof T>) => {
  if (obj) {
    for (const f of fields) {
      const v = obj[f]
      if (typeof v === 'string') {
        (obj as any)[f] = new Date(v)
      }
    }
  }

  return obj
}

export const restoreDates = <T> (obj: T | T[], ...fields: Array<keyof T>) => {
  if (obj) {
    if (Array.isArray(obj)) {
      obj.forEach(o => restoreDate(o, ...fields))
    } else {
      restoreDate(obj, ...fields)
    }
  }
  return obj
}

export const prepareDate = <T> (obj: T, ...fields: Array<keyof T>) => {
  if (obj) {
    for (const f of fields) {
      const v = obj[f]
      if (v instanceof Date) {
        (obj as any)[f] = v.toISOString()
      }
    }
  }

  return obj
}

export const prepareDates = <T> (obj: T | T[], ...fields: Array<keyof T>) => {
  if (obj) {
    if (Array.isArray(obj)) {
      obj.forEach(o => prepareDate(o, ...fields))
    } else {
      prepareDate(obj, ...fields)
    }
  }
  return obj
}
