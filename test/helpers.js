'use strict'
const assert = require('node:assert/strict')

const close = (actual, expected, eps = 1e-6) => {
  assert.equal(actual.length, expected.length, `length ${actual.length} != ${expected.length}`)
  for (let i = 0; i < actual.length; i++) {
    if (!(Math.abs(actual[i] - expected[i]) <= eps)) {
      assert.fail(`[${actual}] != [${expected}] at index ${i} (eps ${eps})`)
    }
  }
}

const frameClose = (a, b, eps = 1e-6) => {
  close(a.origin, b.origin, eps)
  close(a.z, b.z, eps)
  close(a.x, b.x, eps)
}

module.exports = { close, frameClose }
