'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close } = require('./helpers')
const { yOf } = require('../src/frame')
const { defaultFrame, defaultFrames, yHint } = require('../src/defaults')

const { cuboid, rectangle } = raw.primitives
const s = Math.SQRT1_2
const box = () => cuboid({ size: [2, 4, 6], center: [1, 2, 3] })

const expectFrame = (d, origin, z, x) => {
  const f = defaultFrame(box(), d)
  close(f.origin, origin)
  close(f.z, z)
  close(f.x, x)
}

test('center', () => expectFrame([0, 0, 0], [1, 2, 3], [0, 0, 1], [1, 0, 0]))
test('top face', () => expectFrame([0, 0, 1], [1, 2, 6], [0, 0, 1], [1, 0, 0]))
test('bottom face', () => expectFrame([0, 0, -1], [1, 2, 0], [0, 0, -1], [-1, 0, 0]))
test('right face', () => expectFrame([1, 0, 0], [2, 2, 3], [1, 0, 0], [0, 1, 0]))
test('front face', () => expectFrame([0, -1, 0], [1, 0, 3], [0, -1, 0], [1, 0, 0]))
test('top+right edge', () => expectFrame([1, 0, 1], [2, 2, 6], [s, 0, s], [-s, 0, s]))
test('top+front edge', () => expectFrame([0, -1, 1], [1, 0, 6], [0, -s, s], [0, s, s]))
test('back+right vertical edge', () => expectFrame([1, 1, 0], [2, 4, 3], [s, s, 0], [-s, s, 0]))
test('top+back+right corner', () => {
  const f = defaultFrame(box(), [1, 1, 1])
  close(f.origin, [2, 4, 6])
  close(f.x, [-s, s, 0])
})

test('yHint follows the BOSL2 cuboid spin rule', () => {
  close(yHint([0, 0, 1]), [0, 1, 0])
  close(yHint([1, 0, 0]), [0, 0, 1])
  close(yHint([1, 1, 1]), [0, 0, 1])
  close(yHint([1, 1, 0]), [0, 0, 1])
  close(yHint([1, 0, 1]), [0, -1, 0])
  close(yHint([-1, 0, -1]), [0, -1, 0])
  close(yHint([0, -1, 1]), [-1, 0, 0])
})

test('side-face frames have y pointing up', () => {
  close(yOf(defaultFrame(box(), [-1, 0, 0])), [0, 0, 1])
})

test('geom2 defaults use its bounding box', () => {
  const f = defaultFrame(rectangle({ size: [4, 2] }), [1, 0, 0])
  close(f.origin, [2, 0, 0])
  close(f.z, [1, 0, 0])
})

test('defaultFrames names all 27 directions', () => {
  const frames = defaultFrames(box())
  assert.equal(Object.keys(frames).length, 27)
  assert.ok(frames['top+front+left'])
  assert.ok(frames.center)
})

test('defaults follow lazy transforms', () => {
  const g = raw.transforms.translate([10, 0, 0], box())
  close(defaultFrame(g, [0, 0, 1]).origin, [11, 2, 6])
})

test('defaultFrame rejects path2', () => {
  assert.throws(() => defaultFrame(raw.geometries.path2.create(), [0, 0, 1]), /geom2 or geom3/)
})
