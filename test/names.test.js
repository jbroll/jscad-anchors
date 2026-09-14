'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { DIRECTIONS, directionName, parseDirection, canonicalName } = require('../src/names')

test('DIRECTIONS has 27 distinct vectors including center', () => {
  assert.equal(DIRECTIONS.length, 27)
  assert.equal(new Set(DIRECTIONS.map(String)).size, 27)
  assert.ok(DIRECTIONS.some((d) => d.every((c) => c === 0)))
})

test('directionName orders words z, y, x', () => {
  assert.equal(directionName([0, 0, 1]), 'top')
  assert.equal(directionName([1, 0, 1]), 'top+right')
  assert.equal(directionName([-1, -1, 1]), 'top+front+left')
  assert.equal(directionName([1, 1, -1]), 'bottom+back+right')
  assert.equal(directionName([0, 0, 0]), 'center')
})

test('directionName rejects components outside -1, 0, 1', () => {
  assert.throws(() => directionName([0.5, 0, 1]), /direction components must be -1, 0, or 1/)
})

test('parseDirection accepts any order and BOSL2 aliases', () => {
  assert.deepEqual(parseDirection('right+top'), [1, 0, 1])
  assert.deepEqual(parseDirection('up+fwd+left'), [-1, -1, 1])
  assert.deepEqual(parseDirection('bot'), [0, 0, -1])
  assert.deepEqual(parseDirection('center'), [0, 0, 0])
})

test('parseDirection returns null for non-direction names', () => {
  assert.equal(parseDirection('bolt1.axis'), null)
  assert.equal(parseDirection('top+bottom'), null)
  assert.equal(parseDirection('top+widget'), null)
})

test('canonicalName canonicalizes directions and keeps other names', () => {
  assert.equal(canonicalName('right+top'), 'top+right')
  assert.equal(canonicalName([0, 0, 1]), 'top')
  assert.equal(canonicalName('bolt1.axis'), 'bolt1.axis')
})
