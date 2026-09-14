'use strict'
const test = require('node:test')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const { anchor } = require('../src/lookup')
const { fromConnector, toConnector } = require('../src/convert')
const { attach, alignTo } = require('../src/place')
const m = require('../src/wrap')

const { cuboid, rectangle } = raw.primitives
const range = (g, axis) => {
  const [min, max] = m.measurements.measureBoundingBox(g)
  return [min[axis], max[axis]]
}
const A = () => cuboid({ size: [10, 10, 10] })
const B = () => cuboid({ size: [4, 4, 4] })

test('attach bottom to top stacks face to face', () => {
  const r = attach(B(), 'bottom', A(), 'top')
  close(range(r, 2), [5, 9])
  close(range(r, 0), [-2, 2])
  const f = anchor(r, 'bottom')
  close(f.origin, [0, 0, 5])
  close(f.z, [0, 0, -1])
})

test('attach overlap moves the child into the parent', () => {
  close(range(attach(B(), 'bottom', A(), 'top', { overlap: 1 }), 2), [4, 8])
})

test('attach flip false makes z axes equal', () => {
  close(range(attach(B(), 'top', A(), 'top', { flip: false }), 2), [1, 5])
})

test('attach spin rotates the child about its frame z', () => {
  const child = withAnchors(B(), { f: frame([0, 0, -2], [0, 0, -1], [1, 0, 0]) })
  const f = worldFrames(attach(child, 'f', A(), 'top', { spin: Math.PI / 2 })).f
  close(f.origin, [0, 0, 5])
  close(f.z, [0, 0, -1])
  close(f.x, [0, -1, 0])
})

test('parent frame round trips through toConnector', () => {
  const f = anchor(A(), 'top')
  frameClose(fromConnector(toConnector(f)), f)
})

test('attach works for geom2, including the reversing rotation', () => {
  const r = attach(rectangle({ size: [2, 2] }), 'left', rectangle({ size: [10, 10] }), 'right')
  close(range(r, 0), [5, 7])
  close(range(r, 1), [-1, 1])
  close(anchor(r, 'left').origin, [5, 0, 0])
})

test('alignTo top outside, centered on other axes', () => {
  const r = alignTo(cuboid({ size: [2, 2, 2] }), A(), 'top')
  close(range(r, 2), [5, 7])
  close(range(r, 0), [-1, 1])
})

test('alignTo top inside', () => {
  close(range(alignTo(cuboid({ size: [2, 2, 2] }), A(), 'top', { inside: true }), 2), [3, 5])
})

test('alignTo edge inside with inset', () => {
  const r = alignTo(cuboid({ size: [2, 2, 2] }), A(), 'top+right', { inside: true, inset: 1 })
  close(range(r, 0), [2, 4])
  close(range(r, 2), [2, 4])
  close(range(r, 1), [-1, 1])
})

test('alignTo accepts a vector and carries frames', () => {
  const child = withAnchors(cuboid({ size: [2, 2, 2] }), { p: frame([0, 0, 0], [0, 0, 1]) })
  const r = alignTo(child, A(), [0, -1, 0])
  close(range(r, 1), [-7, -5])
  close(worldFrames(r).p.origin, [0, -6, 0])
})
