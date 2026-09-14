'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { maths } = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const {
  frame, frameFromY, yOf, spinReference, frameToMat4, mat4ToFrame, transformFrame, mapFrames
} = require('../src/frame')

test('frame normalizes z and orthogonalizes x', () => {
  const f = frame([1, 2, 3], [0, 0, 2], [1, 0, 1])
  close(f.origin, [1, 2, 3])
  close(f.z, [0, 0, 1])
  close(f.x, [1, 0, 0])
})

test('frame is frozen', () => {
  const f = frame([0, 0, 0], [0, 0, 1])
  assert.ok(Object.isFrozen(f))
  assert.ok(Object.isFrozen(f.origin))
})

test('frame accepts a 2D origin', () => {
  close(frame([1, 2], [0, 0, 1]).origin, [1, 2, 0])
})

test('frame rejects a zero z', () => {
  assert.throws(() => frame([0, 0, 0], [0, 0, 0]), /z must be a non-zero vector/)
})

test('missing or parallel x uses the BOSL2 spin-0 reference', () => {
  close(frame([0, 0, 0], [0, 0, 1]).x, [1, 0, 0])
  close(frame([0, 0, 0], [0, 0, 5], [0, 0, 1]).x, [1, 0, 0])
  close(spinReference([0, 0, 1]), [1, 0, 0])
  close(spinReference([0, 0, -1]), [-1, 0, 0])
  close(spinReference([1, 0, 0]), [0, 0, -1])
  close(spinReference([0, 1, 0]), [1, 0, 0])
  close(spinReference([0, -1, 0]), [1, 0, 0])
})

test('frameFromY points y along the perpendicular part of the hint', () => {
  const s = Math.SQRT1_2
  const f = frameFromY([0, 0, 0], [1, 0, 1], [0, 0, 1])
  close(f.z, [s, 0, s])
  close(yOf(f), [-s, 0, s])
  close(f.x, [0, 1, 0])
})

test('frames are right-handed', () => {
  const f = frame([0, 0, 0], [1, 2, 3], [0, 1, 0])
  const y = yOf(f)
  const { vec3 } = maths
  close([vec3.dot(vec3.cross(vec3.create(), f.x, y), f.z)], [1])
})

test('frameToMat4 and mat4ToFrame round trip', () => {
  const f = frame([4, 5, 6], [0, 1, 1], [1, 0, 0])
  const m = frameToMat4(f)
  close([m[12], m[13], m[14], m[15]], [4, 5, 6, 1])
  frameClose(mat4ToFrame(m), f)
})

test('transformFrame applies translation and rotation', () => {
  const { mat4 } = maths
  const m = mat4.multiply(mat4.create(),
    mat4.fromTranslation(mat4.create(), [10, 0, 0]),
    mat4.fromZRotation(mat4.create(), Math.PI / 2))
  const f = transformFrame(m, frame([1, 0, 0], [1, 0, 0], [0, 1, 0]))
  close(f.origin, [10, 1, 0])
  close(f.z, [0, 1, 0])
  close(f.x, [-1, 0, 0])
})

test('transformFrame under a mirror stays right-handed', () => {
  const { mat4 } = maths
  const m = mat4.fromScaling(mat4.create(), [-1, 1, 1])
  const f = transformFrame(m, frame([1, 0, 0], [1, 0, 0], [0, 1, 0]))
  close(f.origin, [-1, 0, 0])
  close(f.z, [-1, 0, 0])
  close(f.x, [0, 1, 0])
  close(yOf(f), [0, 0, -1])
})

test('mapFrames maps values and freezes the result', () => {
  const out = mapFrames({ a: frame([0, 0, 0], [0, 0, 1]) }, (f) => frame([1, 1, 1], f.z, f.x))
  close(out.a.origin, [1, 1, 1])
  assert.ok(Object.isFrozen(out))
})
