'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../src/booleans')

const { cuboid, cylinder, rectangle } = raw.primitives
const { translate, rotateZ } = raw.transforms
const at = (x) => frame([x, 0, 0], [0, 0, 1])

test('union keeps the first operand on name clashes and adds new names', () => {
  const a = withAnchors(cuboid(), { p: at(0) })
  const b = translate([10, 0, 0], withAnchors(cuboid(), { p: at(1), q: at(2) }))
  const r = unionAnchored(a, b)
  const frames = worldFrames(r)
  close(frames.p.origin, [0, 0, 0])
  close(frames.q.origin, [12, 0, 0])
  assert.ok(raw.maths.mat4.isIdentity(r.transforms))
})

test('union flattens arrays in order', () => {
  const a = withAnchors(cuboid(), { p: at(1) })
  const b = withAnchors(cuboid(), { p: at(2) })
  close(worldFrames(unionAnchored([a, [b]])).p.origin, [1, 0, 0])
})

test('union converts transformed operands to world space', () => {
  const a = rotateZ(Math.PI / 2, withAnchors(cuboid(), { f: frame([1, 0, 0], [1, 0, 0]) }))
  const f = worldFrames(unionAnchored(a, cuboid())).f
  close(f.origin, [0, 1, 0])
  close(f.z, [0, 1, 0])
})

test('operands stay readable after the boolean', () => {
  const a = translate([3, 0, 0], withAnchors(cuboid(), { p: at(0) }))
  unionAnchored(a, cuboid())
  close(worldFrames(a).p.origin, [3, 0, 0])
})

test('subtract keeps the first operand frames and drops tool frames', () => {
  const plate = withAnchors(cuboid({ size: [20, 20, 2] }), { corner: at(10) })
  const tool = withAnchors(cylinder({ radius: 1, height: 4 }), { axis: at(0) })
  const frames = worldFrames(subtractAnchored(plate, tool))
  assert.deepEqual(Object.keys(frames), ['corner'])
})

test('subtract carry adds prefixed world frames of the tool', () => {
  const plate = cuboid({ size: [20, 20, 2] })
  const cyl = translate([5, 0, 0], withAnchors(cylinder({ radius: 1, height: 4 }), { axis: frame([0, 0, 0], [0, 0, 1]) }))
  const r = subtractAnchored(plate, cyl, { carry: { bolt1: cyl } })
  const frames = worldFrames(r)
  assert.deepEqual(Object.keys(frames), ['bolt1.axis'])
  close(frames['bolt1.axis'].origin, [5, 0, 0])
  close(frames['bolt1.axis'].z, [0, 0, 1])
})

test('intersect keeps only the first operand frames', () => {
  const a = withAnchors(cuboid({ size: [4, 4, 4] }), { p: at(0) })
  const b = withAnchors(cuboid({ size: [2, 2, 2] }), { q: at(0) })
  assert.deepEqual(Object.keys(worldFrames(intersectAnchored(a, b))), ['p'])
})

test('geom2 booleans keep frames', () => {
  const a = translate([1, 0, 0], withAnchors(rectangle({ size: [4, 4] }), { p: at(0) }))
  const r = unionAnchored(a, rectangle({ size: [2, 2] }))
  close(worldFrames(r).p.origin, [1, 0, 0])
  assert.equal(r.anchors.basis, r.sides)
})

test('no frames means the raw result is returned unchanged', () => {
  const r = unionAnchored(cuboid(), translate([0.5, 0, 0], cuboid()))
  assert.equal(r.anchors, undefined)
})
