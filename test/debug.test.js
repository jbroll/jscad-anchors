'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors } = require('../src/storage')
const { anchorArrows } = require('../src/debug')

const { cuboid } = raw.primitives

test('one arrow per anchor, explicit plus defaults', () => {
  assert.equal(anchorArrows(withAnchors(cuboid(), { bolt: frame([0, 0, 0], [1, 0, 0]) })).length, 28)
  assert.equal(anchorArrows(withAnchors(cuboid(), { top: frame([0, 0, 1], [0, 0, 1]) })).length, 27)
})

test('arrows are geom3 placed on their frames', () => {
  const arrows = anchorArrows(cuboid({ size: [2, 2, 2] }), { length: 5 })
  assert.ok(arrows.every((a) => raw.geometries.geom3.isA(a)))
  const top = arrows.find((a) => a.name === 'top')
  const [min, max] = raw.measurements.measureBoundingBox(top)
  close([max[2]], [6], 1e-6)
  close([max[0]], [2], 1e-6)
  assert.ok(min[2] > 0.8)
})
