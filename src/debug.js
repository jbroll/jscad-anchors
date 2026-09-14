'use strict'
const { booleans, primitives, transforms } = require('@jscad/modeling')
const { frameToMat4 } = require('./frame')
const { worldFrames } = require('./storage')
const { defaultFrames } = require('./defaults')

const arrow = (name, f, length) => {
  const r = length / 20
  const shaft = primitives.cylinder({ radius: r, height: length * 0.75, center: [0, 0, length * 0.375], segments: 12 })
  const head = primitives.cylinderElliptic({
    height: length * 0.25, startRadius: [r * 2.5, r * 2.5], endRadius: [0, 0], center: [0, 0, length * 0.875], segments: 12
  })
  const bar = primitives.cuboid({ size: [length * 0.4, r, r], center: [length * 0.2, 0, 0] })
  const placed = transforms.transform(frameToMat4(f), booleans.union(shaft, head, bar))
  return Object.assign(placed, { name })
}

const anchorArrows = (geometry, { length = 5 } = {}) => {
  const frames = Object.assign({}, defaultFrames(geometry), worldFrames(geometry))
  return Object.entries(frames).map(([name, f]) => arrow(name, f, length))
}

module.exports = { anchorArrows }
