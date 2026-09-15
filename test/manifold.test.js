'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const esbuild = require('esbuild')
const modeling = require('@jscad/modeling')
const { frameClose } = require('./helpers')

const { geometries, maths, primitives } = modeling
const { mat4 } = maths

let polygonReads = 0

// Shaped like jscadui's ManifoldGeom3: mesh state in private fields, type and polygons as prototype getters.
class Solid {
  #handle
  #color = null
  #polygons = null

  constructor (handle) {
    this.#handle = handle
    this.transforms = mat4.create()
  }

  get manifold () { return this.#handle }
  get type () { return 'mesh' }
  get isManifoldGeom3 () { return true }
  get color () { return this.#color }
  set color (value) { this.#color = value }

  get polygons () {
    polygonReads++
    if (this.#polygons === null) {
      const box = geometries.geom3.transform(this.#handle.matrix, primitives.cuboid({ size: [2, 2, 2] }))
      this.#polygons = geometries.geom3.toPolygons(box)
    }
    return this.#polygons
  }

  clone () {
    const out = new Solid(this.#handle)
    out.#color = this.#color
    return out
  }
}

const isSolid = (g) => Boolean(g) && g.isManifoldGeom3 === true
const handleOf = (g) => (isSolid(g) ? g.manifold : { matrix: mat4.create() })
const single = (results) => (results.length === 1 ? results[0] : results)

// Like manifold's transforms: a new object per input, keeping only color.
const moving = (rawFn) => (lead, ...geoms) => single(geoms.flat(Infinity).map((g) => {
  if (g.points !== undefined) return rawFn(lead, g)
  const step = rawFn(lead, geometries.path2.create()).transforms
  const out = new Solid({ matrix: mat4.multiply(mat4.create(), step, handleOf(g).matrix) })
  if (isSolid(g) && g.color) out.color = g.color
  return out
}))

const boolean = (...geoms) => {
  const items = geoms.flat(Infinity)
  if (items.length === 1 && isSolid(items[0])) return items[0]
  return new Solid({ matrix: handleOf(items[0]).matrix })
}

const colorize = (color, ...geoms) => single(geoms.flat(Infinity).map((g) => {
  const out = isSolid(g) ? g.clone() : new Solid(handleOf(g))
  out.color = color
  return out
}))

const fakeManifold = {
  ...modeling,
  geometries: { ...geometries, isManifoldGeom3: isSolid },
  transforms: {
    ...modeling.transforms,
    translate: moving(modeling.transforms.translate),
    rotateZ: moving(modeling.transforms.rotateZ),
    transform: moving(modeling.transforms.transform)
  },
  booleans: { ...modeling.booleans, union: boolean, subtract: boolean, intersect: boolean },
  colors: { ...modeling.colors, colorize }
}

const loadOver = async (fake) => {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/browser.js')],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    write: false,
    external: ['@jscad/modeling'],
    logLevel: 'silent'
  })
  const module = { exports: {} }
  const requireFor = (name) => {
    if (name === '@jscad/modeling') return fake
    throw new Error(`bundle required ${name}`)
  }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, requireFor)
  return module.exports
}

const solid = () => new Solid({ matrix: mat4.create() })
const AXIS = { axis: { origin: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] } }

test('anchors on manifold-shaped geometry', async (t) => {
  const api = await loadOver(fakeManifold)
  const { anchors, booleans, colors, transforms } = api
  const at = (origin, z = [0, 0, 1], x = [1, 0, 0]) => anchors.frame(origin, z, x)
  t.beforeEach(() => { polygonReads = 0 })

  await t.test('withAnchors keeps the geometry class and its private state', () => {
    const source = colors.colorize([1, 0, 0, 1], solid())
    const g = anchors.withAnchors(source, AXIS)
    assert.equal(g.isManifoldGeom3, true)
    assert.equal(g.manifold, source.manifold)
    assert.deepEqual(g.color, [1, 0, 0, 1])
    frameClose(anchors.anchor(g, 'axis'), at([0, 0, 0]))
    assert.equal(polygonReads, 0)
  })

  await t.test('withAnchors then translate keeps the frame at the translated position', () => {
    const cutter = transforms.translate([6, 2, 0], anchors.withAnchors(solid(), AXIS))
    assert.equal(cutter.isManifoldGeom3, true)
    frameClose(anchors.anchor(cutter, 'axis'), at([6, 2, 0]))
    assert.equal(polygonReads, 0)
  })

  await t.test('rotateZ and colorize keep frames', () => {
    const g = colors.colorize([0, 1, 0, 1], transforms.rotateZ(Math.PI / 2,
      transforms.translate([1, 0, 0], anchors.withAnchors(solid(), AXIS))))
    frameClose(anchors.anchor(g, 'axis'), at([0, 1, 0], [0, 0, 1], [0, 1, 0]))
    assert.deepEqual(g.color, [0, 1, 0, 1])
    assert.equal(polygonReads, 0)
  })

  await t.test('subtractAnchored with carry keeps carried frames', () => {
    const cutter = transforms.translate([6, 2, 0], anchors.withAnchors(solid(), AXIS))
    const plate = booleans.subtract(solid(), cutter, { carry: { bolt1: cutter } })
    assert.equal(plate.isManifoldGeom3, true)
    frameClose(anchors.anchor(plate, 'bolt1.axis'), at([6, 2, 0]))
    assert.equal(polygonReads, 0)
  })

  await t.test('attach places the child on a carried frame', () => {
    const cutter = transforms.translate([6, 2, 0], anchors.withAnchors(solid(), AXIS))
    const plate = booleans.subtract(solid(), cutter, { carry: { bolt1: cutter } })
    const pin = anchors.attach(anchors.withAnchors(solid(), AXIS), 'axis', plate, 'bolt1.axis')
    assert.equal(pin.isManifoldGeom3, true)
    frameClose(anchors.anchor(pin, 'axis'), at([6, 2, 0], [0, 0, -1], [-1, 0, 0]))
    assert.equal(polygonReads, 0)
  })
})

test('over plain modeling, lazy transforms stay the raw functions', async () => {
  const api = await loadOver(modeling)
  assert.equal(api.transforms.translate, modeling.transforms.translate)
  assert.equal(api.colors.colorize, modeling.colors.colorize)
})
