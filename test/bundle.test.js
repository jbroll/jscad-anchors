'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const modeling = require('@jscad/modeling')
const source = require('../src')
const { frameClose } = require('./helpers')

const root = path.join(__dirname, '..')
execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'inherit' })

const loadBundle = (fakeModeling) => {
  const code = readFileSync(path.join(root, 'dist/jscad-anchors.cjs'), 'utf8')
  const module = { exports: {} }
  const requireFor = (name) => {
    if (name === '@jscad/modeling-for-anchors') return fakeModeling
    throw new Error(`bundle required ${name}`)
  }
  new Function('module', 'exports', 'require', code)(module, module.exports, requireFor)
  return module.exports
}

const fake = { ...modeling, ready: Promise.resolve(), setUseGpuNormals: () => {} }
fake.default = fake
const bundle = loadBundle(fake)

const scene = (api) => {
  const { anchors, primitives, transforms } = api
  const axis = { axis: anchors.frame([0, 0, 0], [0, 0, 1], [1, 0, 0]) }
  const cutter = transforms.translate([6, 2, 0],
    anchors.withAnchors(primitives.cylinder({ radius: 3, height: 10, segments: 32 }), axis))
  const plate = anchors.subtractAnchored(primitives.cuboid({ size: [30, 20, 5] }), cutter, { carry: { bolt1: cutter } })
  return anchors(plate)
}

test('the bundle gives the same frames as the source', () => {
  const expected = scene(source)
  const actual = scene(bundle)
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
  for (const name of Object.keys(expected)) frameClose(actual[name], expected[name])
})

test('the bundle exposes the modeling module\'s own top-level keys', () => {
  assert.equal(bundle.setUseGpuNormals, fake.setUseGpuNormals)
  assert.equal(bundle.ready, fake.ready)
})

test('default points at the bundle exports, anchors included', () => {
  assert.equal(bundle.default, bundle)
  assert.equal(typeof bundle.default.anchors, 'function')
})
