'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')

const ready = Promise.resolve()
const setUseGpuNormals = () => {}
raw.default = raw
raw.ready = ready
raw.setUseGpuNormals = setUseGpuNormals

const m = require('../src/wrap')

test('a default that points at the module maps to the wrapped module', () => {
  assert.equal(m.default, m)
})

test('non-plain objects are copied, not rebuilt', () => {
  assert.equal(m.ready, ready)
})

test('unclassified top-level functions pass through', () => {
  assert.equal(m.setUseGpuNormals, setUseGpuNormals)
})
