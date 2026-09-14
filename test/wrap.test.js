'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame, yOf } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../src/booleans')
const m = require('../src/wrap')

const { cuboid, rectangle } = raw.primitives
const p = frame([1, 0, 0], [1, 0, 0], [0, 1, 0])
const cube = () => m.transforms.translate([3, 0, 0], withAnchors(cuboid({ size: [2, 2, 2] }), { p }))
const square = () => m.transforms.translate([3, 0, 0], withAnchors(rectangle({ size: [2, 2] }), { p }))

const expectP = (g, origin, z, x) => {
  const f = worldFrames(g).p
  close(f.origin, origin)
  close(f.z, z)
  close(f.x, x)
}

test('none and lazy functions are the raw functions', () => {
  assert.equal(m.maths.vec3.add, raw.maths.vec3.add)
  assert.equal(m.transforms.translate, raw.transforms.translate)
  assert.equal(m.primitives.cuboid, raw.primitives.cuboid)
})

test('booleans are the anchored booleans', () => {
  assert.equal(m.booleans.union, unionAnchored)
  assert.equal(m.booleans.subtract, subtractAnchored)
  assert.equal(m.booleans.intersect, intersectAnchored)
})

test('lazy: translate and colorize carry frames', () => {
  expectP(m.colors.colorize([1, 0, 0], cube()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('bake: measureBoundingBox leaves frames readable', () => {
  const g = cube()
  close(m.measurements.measureBoundingBox(g)[1], [4, 1, 1])
  expectP(g, [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('bake: center moves frames with the geometry', () => {
  expectP(m.transforms.center({}, cube()), [1, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('matrix: geom3 mirror stays lazy and correct', () => {
  expectP(m.transforms.mirrorX(cube()), [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('matrix: geom3 rotateZ does not bake the input', () => {
  const g = cube()
  const polygons = g.polygons
  const r = m.transforms.rotateZ(1, g)
  assert.equal(g.polygons, polygons)
  assert.equal(raw.maths.mat4.isIdentity(g.transforms), false)
  const c = Math.cos(1)
  const s = Math.sin(1)
  expectP(r, [4 * c, 4 * s, 0], [c, s, 0], [-s, c, 0])
})

test('matrix: geom2 mirrorX keeps frames, right-handed', () => {
  const g = m.transforms.mirrorX(square())
  expectP(g, [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
  close(yOf(worldFrames(g).p), [0, 0, -1])
  const [min, max] = m.measurements.measureBoundingBox(g)
  close([min[0], max[0]], [-4, -2])
})

test('matrix: geom2 transform with a negative scaling matrix', () => {
  const mirror = raw.maths.mat4.fromScaling(raw.maths.mat4.create(), [-1, 1, 1])
  expectP(m.transforms.transform(mirror, square()), [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('matrix: geom2 rotateX(pi) goes through reverse', () => {
  expectP(m.transforms.rotateX(Math.PI, square()), [4, 0, 0], [1, 0, 0], [0, -1, 0])
})

test('matrix: geometries.geom2.transform with a mirror matrix', () => {
  const mirror = raw.maths.mat4.fromScaling(raw.maths.mat4.create(), [-1, 1, 1])
  expectP(m.geometries.geom2.transform(mirror, square()), [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('matrix: arrays keep frames per item', () => {
  const [a, b] = m.transforms.mirrorX([square(), cube()])
  expectP(a, [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
  expectP(b, [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('keep: generalize, retessellate, invert, reverse', () => {
  const generalized = m.modifiers.generalize({ triangulate: true }, cube())
  expectP(generalized, [4, 0, 0], [1, 0, 0], [0, 1, 0])
  assert.equal(generalized.anchors.basis, generalized.polygons)
  expectP(m.modifiers.retessellate(cube()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
  expectP(m.geometries.geom3.invert(cube()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
  expectP(m.geometries.geom2.reverse(square()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('drop: hull result has no frames and the input stays readable', () => {
  const g = cube()
  const h = m.hulls.hull(g, m.transforms.translate([10, 0, 0], cuboid()))
  assert.equal(h.anchors, undefined)
  expectP(g, [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('bake: toPolygons through the wrapper then raw measure is safe', () => {
  const g = cube()
  m.geometries.geom3.toPolygons(g)
  raw.measurements.measureBoundingBox(g)
  frameClose(worldFrames(g).p, frame([4, 0, 0], [1, 0, 0], [0, 1, 0]))
})
