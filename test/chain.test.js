'use strict'
const test = require('node:test')
const raw = require('@jscad/modeling')
const { frameClose } = require('./helpers')
const { frame, transformFrame } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const m = require('../src/wrap')

const { mat4 } = raw.maths

const rng = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const ops = (r) => {
  const between = (lo, hi) => lo + (hi - lo) * r()
  const unit = () => {
    const v = [between(-1, 1), between(-1, 1), between(-1, 1)]
    const len = Math.hypot(...v) || 1
    return v.map((c) => c / len)
  }
  const sign = () => (r() < 0.5 ? -1 : 1)
  return [
    () => ['translate', [[between(-10, 10), between(-10, 10), between(-10, 10)]]],
    () => ['rotate', [[between(-Math.PI, Math.PI), between(-Math.PI, Math.PI), between(-Math.PI, Math.PI)]]],
    () => ['rotateX', [Math.PI]],
    () => ['scale', [[between(0.8, 1.25), between(0.8, 1.25), between(0.8, 1.25)]]],
    () => ['mirror', [{ origin: [between(-5, 5), between(-5, 5), between(-5, 5)], normal: unit() }]],
    () => ['transform', [raw.maths.mat4.fromScaling(raw.maths.mat4.create(), [sign() * between(0.8, 1.25), sign() * between(0.8, 1.25), sign() * between(0.8, 1.25)])]]
  ]
}

const bakes = [
  (g) => m.measurements.measureBoundingBox(g),
  (g) => (raw.geometries.geom3.isA(g) ? m.geometries.geom3.toPolygons(g) : m.geometries.geom2.toSides(g))
]

const runChain = (seed, shape, f0) => {
  const r = rng(seed)
  const choices = ops(r)
  let g = withAnchors(shape, { p: f0 })
  let total = mat4.create()
  for (let step = 0; step < 12; step++) {
    if (r() < 0.3) bakes[Math.floor(r() * bakes.length)](g)
    const [name, lead] = choices[Math.floor(r() * choices.length)]()
    const matrix = raw.transforms[name](...lead, raw.geometries.path2.create()).transforms
    g = m.transforms[name](...lead, g)
    total = mat4.multiply(mat4.create(), matrix, total)
    frameClose(worldFrames(g).p, transformFrame(total, f0), 1e-4)
  }
}

test('geom3 frames survive random transform chains with bakes', () => {
  for (let seed = 1; seed <= 40; seed++) {
    runChain(seed, raw.primitives.cuboid({ size: [2, 3, 4] }), frame([1, 2, 3], [0, 0, 1], [1, 0, 0]))
  }
})

test('geom2 frames survive random transform chains with bakes', () => {
  for (let seed = 1; seed <= 40; seed++) {
    runChain(seed, raw.primitives.rectangle({ size: [2, 3] }), frame([1, 0.5, 0], [1, 0, 0], [0, 1, 0]))
  }
})
