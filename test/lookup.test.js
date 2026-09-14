'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors, bake } = require('../src/storage')
const { anchors, anchor } = require('../src/lookup')

const { cuboid } = raw.primitives
const { translate } = raw.transforms
const f0 = frame([0, 0, 0], [1, 0, 0], [0, 1, 0])

test('anchors returns explicit world frames only', () => {
  const g = translate([5, 0, 0], withAnchors(cuboid(), { p: f0 }))
  assert.deepEqual(Object.keys(anchors(g)), ['p'])
  close(anchors(g).p.origin, [5, 0, 0])
})

test('anchor prefers explicit frames over defaults', () => {
  const g = withAnchors(cuboid(), { top: f0 })
  frameClose(anchor(g, 'top'), f0)
  frameClose(anchor(g, [0, 0, 1]), f0)
})

test('anchor falls back to defaults by name or vector', () => {
  const g = cuboid({ size: [2, 2, 2] })
  close(anchor(g, 'right+top').origin, [1, 0, 1])
  close(anchor(g, [1, 0, 1]).origin, [1, 0, 1])
})

test('anchor throws for unknown names', () => {
  assert.throws(() => anchor(cuboid(), 'bolt9'), /unknown anchor "bolt9"/)
})

test('defaults after an in-place bake match a freshly measured box', () => {
  const g = translate([5, 0, 0], withAnchors(cuboid({ size: [2, 2, 2] }), { p: f0 }))
  const before = anchor(g, 'top')
  bake(g)
  const [min, max] = raw.measurements.measureBoundingBox(translate([5, 0, 0], cuboid({ size: [2, 2, 2] })))
  const expected = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2]]
  close(anchor(g, 'top').origin, expected)
  frameClose(anchor(g, 'top'), before)
})
