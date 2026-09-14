'use strict'

const WORDS = {
  top: [2, 1], up: [2, 1], bottom: [2, -1], bot: [2, -1], down: [2, -1],
  back: [1, 1], front: [1, -1], fwd: [1, -1], forward: [1, -1],
  right: [0, 1], left: [0, -1]
}
const AXIS_WORDS = [['left', 'right'], ['front', 'back'], ['bottom', 'top']]
const NAME_ORDER = [2, 1, 0]

const DIRECTIONS = []
for (const z of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const x of [-1, 0, 1]) DIRECTIONS.push([x, y, z])

const directionName = (vector) => {
  const v = [0, 1, 2].map((i) => {
    const c = vector[i] || 0
    const r = Math.round(c)
    if (Math.abs(c - r) > 1e-9 || Math.abs(r) > 1) {
      throw new Error(`direction components must be -1, 0, or 1: [${vector}]`)
    }
    return r
  })
  const words = NAME_ORDER.filter((i) => v[i] !== 0).map((i) => AXIS_WORDS[i][v[i] > 0 ? 1 : 0])
  return words.length ? words.join('+') : 'center'
}

const parseDirection = (name) => {
  if (name === 'center') return [0, 0, 0]
  const v = [0, 0, 0]
  for (const word of name.split('+')) {
    const w = WORDS[word]
    if (!w || v[w[0]] !== 0) return null
    v[w[0]] = w[1]
  }
  return v
}

const canonicalName = (nameOrVector) => {
  if (Array.isArray(nameOrVector)) return directionName(nameOrVector)
  const v = parseDirection(nameOrVector)
  return v ? directionName(v) : nameOrVector
}

module.exports = { DIRECTIONS, directionName, parseDirection, canonicalName }
