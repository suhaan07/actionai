let n = 0
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
