'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { close, frameClose } = require('./helpers')
const { frame, yOf } = require('../src/frame')
const { fromBosl2, fromConnector, toConnector } = require('../src/convert')

test('fromBosl2 with UP orient rotates x by spin degrees', () => {
  const [name, f] = fromBosl2(['a', [1, 2, 3], [0, 0, 1], 90])
  assert.equal(name, 'a')
  close(f.origin, [1, 2, 3])
  close(f.z, [0, 0, 1])
  close(f.x, [0, 1, 0])
})

test('fromBosl2 spin 0 uses the rotate-from-UP reference', () => {
  close(fromBosl2(['b', [0, 0, 0], [2, 0, 0], 0])[1].x, [0, 0, -1])
  close(fromBosl2(['c', [0, 0, 0], [0, 0, -1]])[1].x, [-1, 0, 0])
})

test('fromBosl2 cube RIGHT face with spin 90 has y pointing UP', () => {
  const f = fromBosl2(['right', [1, 0, 0], [1, 0, 0], 90])[1]
  close(f.x, [0, 1, 0])
  close(yOf(f), [0, 0, 1])
})

test('fromBosl2 accepts a 2D position and ignores extra info', () => {
  close(fromBosl2(['d', [1, 2], [0, 0, 1], 0, [['edge_angle', 90]]])[1].origin, [1, 2, 0])
})

test('fromConnector maps point, axis, normal to origin, z, x', () => {
  const f = fromConnector({ point: [1, 2, 3], axis: [0, 0, 1], normal: [1, 0, 0] })
  frameClose(f, frame([1, 2, 3], [0, 0, 1], [1, 0, 0]))
})

test('toConnector round trips through fromConnector', () => {
  const f = frame([4, 5, 6], [0, 1, 0], [0, 0, 1])
  const c = toConnector(f)
  close(c.point, [4, 5, 6])
  close(c.axis, [0, 1, 0])
  close(c.normal, [0, 0, 1])
  frameClose(fromConnector(c), f)
})
