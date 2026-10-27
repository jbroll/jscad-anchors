'use strict'
const { maths, measurements } = require('@jscad/modeling')
const { frame, frameFromY } = require('./frame')
const { DIRECTIONS, directionName } = require('./names')
const { bake, isAnchorable, isTreeNode } = require('./storage')

const { vec3 } = maths
const UP = [0, 0, 1]
const BACK = [0, 1, 0]

const yHint = (d) => {
  const nonzero = d.filter((c) => c !== 0).length
  if (nonzero === 1) return d[2] !== 0 ? BACK : UP
  if (nonzero !== 2) return UP
  const faces = [[d[0], 0, 0], [0, d[1], 0], [0, 0, d[2]]].filter((_, i) => d[i] !== 0)
  const e = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), faces[0], faces[1]))
  if (Math.abs(e[2]) > 1e-9) return vec3.scale(vec3.create(), e, Math.sign(e[2]))
  const c = vec3.cross(vec3.create(), UP, e)
  const target = vec3.scale(vec3.create(), vec3.normalize(vec3.create(), [d[0], d[1], 0]), d[2])
  return vec3.distance(c, target) < 1e-9 ? e : vec3.negate(vec3.create(), e)
}

// The orientation a lazy directional descriptor resolves with, mirroring the
// tree's `directionBasis` so a deferred node anchor reproduces `defaultFrame`.
const basisOfDirection = (direction) => {
  if (direction.every((c) => c === 0)) return { z: [0, 0, 1], x: [1, 0, 0] }
  const f = frameFromY([0, 0, 0], direction, yHint(direction))
  return { z: f.z, x: f.x }
}

const frameFromBounds = (min, max, d) => {
  const origin = [0, 1, 2].map((i) => (min[i] + max[i]) / 2 + d[i] * (max[i] - min[i]) / 2)
  if (d.every((c) => c === 0)) return frame(origin, UP, [1, 0, 0])
  return frameFromY(origin, d, yHint(d))
}

// A node has no geometry until the tree evaluator runs. During a build the
// tree's eager measurement cache (model-tree's `globalThis.__jscadBuild.specials`)
// holds the evaluated geometry by node identity; measuring it raw reproduces the
// tree's eager `measureBoundingBox` synchronously. Without that cache the frame
// is not knowable yet, so the anchor is emitted as a lazy descriptor that the
// evaluator resolves (place.resolveAnchor builds the same shape).
const eagerNodeGeometry = (node) => {
  const ctx = globalThis.__jscadBuild
  const entry = ctx && ctx.specials && ctx.specials.get(node)
  return entry && entry.geometry
}

const defaultFrame = (geometry, d) => {
  if (!isAnchorable(geometry)) throw new Error('anchor: geometry must be geom2 or geom3')
  if (isTreeNode(geometry)) {
    const eager = eagerNodeGeometry(geometry)
    if (!eager) return { node: geometry, direction: [...d], basis: basisOfDirection(d) }
    const [min, max] = measurements.measureBoundingBox(eager)
    return frameFromBounds(min, max, d)
  }
  bake(geometry)
  const [min, max] = measurements.measureBoundingBox(geometry)
  return frameFromBounds(min, max, d)
}

const defaultFrames = (geometry) =>
  Object.freeze(Object.fromEntries(DIRECTIONS.map((d) => [directionName(d), defaultFrame(geometry, d)])))

module.exports = { yHint, basisOfDirection, defaultFrame, defaultFrames }
