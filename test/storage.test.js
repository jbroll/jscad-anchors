'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const {
  BAKED_OUTSIDE, basisOf, isAnchorable, localFrames, worldFrames, withAnchors, withWorldFrames, bake, bakeAll
} = require('../src/storage')

const { cuboid, rectangle } = raw.primitives
const { translate, rotateZ } = raw.transforms
const f0 = frame([1, 0, 0], [1, 0, 0], [0, 1, 0])

test('BAKED_OUTSIDE text is exact', () => {
  assert.equal(BAKED_OUTSIDE, 'geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors')
})

test('basisOf returns polygons for geom3 and sides for geom2', () => {
  const c = cuboid()
  const r = rectangle()
  assert.equal(basisOf(c), c.polygons)
  assert.equal(basisOf(r), r.sides)
  assert.equal(basisOf(raw.geometries.path2.create()), undefined)
  assert.equal(isAnchorable(c), true)
  assert.equal(isAnchorable({}), false)
})

test('withAnchors returns a new geometry and leaves the input alone', () => {
  const c = cuboid()
  const a = withAnchors(c, { p: f0 })
  assert.notEqual(a, c)
  assert.equal(c.anchors, undefined)
  assert.equal(a.anchors.basis, c.polygons)
  frameClose(localFrames(a).p, f0)
})

test('withAnchors merges and canonicalizes direction names', () => {
  const a = withAnchors(withAnchors(cuboid(), { p: f0 }), { 'right+top': f0 })
  assert.deepEqual(Object.keys(localFrames(a)).sort(), ['p', 'top+right'])
})

test('withAnchors rejects path2', () => {
  assert.throws(() => withAnchors(raw.geometries.path2.create(), { p: f0 }), /geom2 or geom3/)
})

test('worldFrames applies lazy transforms', () => {
  const a = rotateZ(Math.PI / 2, translate([10, 0, 0], withAnchors(cuboid(), { p: f0 })))
  const w = worldFrames(a).p
  close(w.origin, [0, 11, 0])
  close(w.z, [0, 1, 0])
  close(w.x, [-1, 0, 0])
})

test('geometry without anchors has no frames', () => {
  assert.deepEqual(worldFrames(cuboid()), {})
})

test('raw measureBoundingBox on a transformed anchored geom3 is detected', () => {
  const a = translate([10, 0, 0], withAnchors(cuboid(), { p: f0 }))
  raw.measurements.measureBoundingBox(a)
  assert.throws(() => worldFrames(a), { message: BAKED_OUTSIDE })
})

test('raw boolean on a transformed anchored geom3 is detected', () => {
  const a = translate([10, 0, 0], withAnchors(cuboid(), { p: f0 }))
  raw.booleans.union(a, cuboid())
  assert.throws(() => worldFrames(a), { message: BAKED_OUTSIDE })
})

test('raw toSides on a transformed anchored geom2 is detected', () => {
  const a = translate([10, 0, 0], withAnchors(rectangle(), { p: f0 }))
  raw.geometries.geom2.toSides(a)
  assert.throws(() => worldFrames(a), { message: BAKED_OUTSIDE })
})

test('bake keeps world frames and makes later raw calls safe', () => {
  for (const shape of [cuboid(), rectangle()]) {
    const a = translate([10, 0, 0], withAnchors(shape, { p: f0 }))
    const before = worldFrames(a).p
    assert.equal(bake(a), a)
    assert.ok(raw.maths.mat4.isIdentity(a.transforms))
    assert.equal(a.anchors.basis, basisOf(a))
    frameClose(worldFrames(a).p, before)
    raw.measurements.measureBoundingBox(a)
    frameClose(worldFrames(a).p, before)
  }
})

test('bake is a no-op for unanchored and untransformed geometry', () => {
  const plain = translate([1, 0, 0], cuboid())
  const polygons = plain.polygons
  bake(plain)
  assert.equal(plain.polygons, polygons)
  const anchored = withAnchors(cuboid(), { p: f0 })
  const anchors = anchored.anchors
  bake(anchored)
  assert.equal(anchored.anchors, anchors)
})

test('bakeAll recurses into arrays', () => {
  const a = translate([1, 0, 0], withAnchors(cuboid(), { p: f0 }))
  const b = translate([2, 0, 0], withAnchors(rectangle(), { p: f0 }))
  bakeAll([{ option: true }, [a, [b]]])
  assert.ok(raw.maths.mat4.isIdentity(a.transforms))
  assert.ok(raw.maths.mat4.isIdentity(b.transforms))
})

test('withWorldFrames sets frames against the geometry basis', () => {
  const c = cuboid()
  const out = withWorldFrames(c, { q: f0 })
  assert.equal(out.anchors.basis, c.polygons)
  frameClose(worldFrames(out).q, f0)
  assert.equal(withWorldFrames(c, {}), c)
})
