'use strict'

const listFunctions = (node, prefix = '', out = []) => {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') out.push({ path, fn: value })
    else if (value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
      listFunctions(value, path, out)
    }
  }
  return out
}

module.exports = { listFunctions }
