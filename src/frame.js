'use strict'
const { maths } = require('@jscad/modeling')
const { vec3, mat4 } = maths

const UP = [0, 0, 1]
const DOWN = [0, 0, -1]

const point3 = (v) => [v[0], v[1], v[2] || 0]
const freezeVec = (v) => Object.freeze(point3(v))

// BOSL2 affine3d_rot_from_to(UP, z): axis from vector_axis, which picks BACK for DOWN.
const rotationFromUp = (z) => {
  const w = vec3.normalize(vec3.create(), point3(z))
  if (vec3.distance(w, UP) < 1e-9) return mat4.create()
  const axis = vec3.distance(w, DOWN) < 1e-9
    ? [0, 1, 0]
    : vec3.normalize(vec3.create(), vec3.cross(vec3.create(), UP, w))
  const angle = Math.acos(Math.max(-1, Math.min(1, w[2])))
  return mat4.fromRotation(mat4.create(), angle, axis)
}

const spinReference = (z) => point3(vec3.transform(vec3.create(), [1, 0, 0], rotationFromUp(z)))

const frame = (origin, z, x) => {
  if (!(vec3.length(point3(z)) > 1e-12)) throw new Error('frame: z must be a non-zero vector')
  const zn = vec3.normalize(vec3.create(), point3(z))
  let xn = null
  if (x) {
    const xv = point3(x)
    const xo = vec3.subtract(vec3.create(), xv, vec3.scale(vec3.create(), zn, vec3.dot(xv, zn)))
    if (vec3.length(xo) > 1e-6 * vec3.length(xv)) xn = vec3.normalize(xo, xo)
  }
  if (!xn) xn = spinReference(zn)
  return Object.freeze({ origin: freezeVec(origin), z: freezeVec(zn), x: freezeVec(xn) })
}

const yOf = (f) => point3(vec3.cross(vec3.create(), f.z, f.x))

const frameFromY = (origin, z, yHint) => {
  const zn = vec3.normalize(vec3.create(), point3(z))
  const y = vec3.subtract(vec3.create(), point3(yHint), vec3.scale(vec3.create(), zn, vec3.dot(yHint, zn)))
  return frame(origin, zn, vec3.cross(vec3.create(), y, zn))
}

const frameToMat4 = (f) => {
  const y = yOf(f)
  return mat4.fromValues(
    f.x[0], f.x[1], f.x[2], 0,
    y[0], y[1], y[2], 0,
    f.z[0], f.z[1], f.z[2], 0,
    f.origin[0], f.origin[1], f.origin[2], 1
  )
}

const mat4ToFrame = (m) => frame([m[12], m[13], m[14]], [m[8], m[9], m[10]], [m[0], m[1], m[2]])

const linear = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
]

const transformFrame = (matrix, f) =>
  frame(vec3.transform(vec3.create(), f.origin, matrix), linear(matrix, f.z), linear(matrix, f.x))

const mapFrames = (frames, fn) =>
  Object.freeze(Object.fromEntries(Object.entries(frames).map(([name, f]) => [name, fn(f, name)])))

module.exports = {
  frame, frameFromY, yOf, rotationFromUp, spinReference, frameToMat4, mat4ToFrame, transformFrame, mapFrames
}
