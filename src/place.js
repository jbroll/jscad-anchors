'use strict'
const m = require('./wrap')
const { anchor } = require('./lookup')
const { frameToMat4 } = require('./frame')
const { canonicalName, parseDirection } = require('./names')

const { mat4 } = m.maths
const multiply = (...matrices) => matrices.reduce((a, b) => mat4.multiply(mat4.create(), a, b))

const attach = (child, childAnchor, parent, parentAnchor, { overlap = 0, flip = true, spin = 0 } = {}) => {
  const P = frameToMat4(anchor(parent, parentAnchor))
  const C = frameToMat4(anchor(child, childAnchor))
  const M = multiply(
    P,
    mat4.fromTranslation(mat4.create(), [0, 0, -overlap]),
    flip ? mat4.fromXRotation(mat4.create(), Math.PI) : mat4.create(),
    mat4.fromZRotation(mat4.create(), spin),
    mat4.invert(mat4.create(), C)
  )
  return m.transforms.transform(M, child)
}

const alignTo = (child, parent, direction, { inset = 0, inside = false } = {}) => {
  const d = parseDirection(canonicalName(direction))
  if (!d) throw new Error(`alignTo: not a direction: ${direction}`)
  const [cmin, cmax] = m.measurements.measureBoundingBox(child)
  const [pmin, pmax] = m.measurements.measureBoundingBox(parent)
  const offset = [0, 1, 2].map((i) => {
    if (d[i] === 0) return (pmin[i] + pmax[i]) / 2 - (cmin[i] + cmax[i]) / 2
    if (d[i] > 0) return pmax[i] - inset - (inside ? cmax[i] : cmin[i])
    return pmin[i] + inset - (inside ? cmin[i] : cmax[i])
  })
  return m.transforms.translate(offset, child)
}

module.exports = { attach, alignTo }
