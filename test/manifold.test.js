'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const esbuild = require('esbuild')
const modeling = require('@jscad/modeling')
const { frameClose } = require('./helpers')

const { geometries, maths, primitives } = modeling
const { mat4, vec3 } = maths

let polygonReads = 0
let owners = []

const newHandle = (matrix) => ({ matrix, deleted: false })
const live = (handle) => {
  if (handle.deleted) throw new Error('handle deleted')
  return handle
}

// Shaped like jscadui's ManifoldGeom3: mesh state in private fields, type and polygons as prototype getters,
// and every instance owns its handle, as its FinalizationRegistry does.
class Solid {
  #handle
  #color = null
  #polygons = null

  constructor (handle) {
    this.#handle = handle
    this.transforms = mat4.create()
    owners.push(this)
  }

  get manifold () { return this.#handle }
  get type () { return 'mesh' }
  get isManifoldGeom3 () { return true }
  get color () { return this.#color }
  set color (value) { this.#color = value }

  get polygons () {
    polygonReads++
    const { matrix } = live(this.#handle)
    if (this.#polygons === null) {
      const box = geometries.geom3.transform(matrix, primitives.cuboid({ size: [2, 2, 2] }))
      this.#polygons = geometries.geom3.toPolygons(box)
    }
    return this.#polygons
  }

  volume () {
    live(this.#handle)
    return 8
  }

  boundingBox () {
    const { matrix } = live(this.#handle)
    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) =>
      vec3.transform(vec3.create(), [x, y, z], matrix))))
    const pick = (fn) => [0, 1, 2].map((i) => fn(...corners.map((c) => c[i])))
    return [pick(Math.min), pick(Math.max)]
  }

  clone () {
    const out = new Solid(this.#handle)
    out.#color = this.#color
    return out
  }
}

// Stands in for garbage collection: a released owner deletes its handle, even one a kept instance shares.
const releaseAllExcept = (...kept) => {
  for (const owner of owners) if (!kept.includes(owner)) owner.manifold.deleted = true
  owners = kept.slice()
}

const isSolid = (g) => Boolean(g) && g.isManifoldGeom3 === true
const handleOf = (g) => (isSolid(g) ? live(g.manifold) : newHandle(mat4.create()))
const single = (results) => (results.length === 1 ? results[0] : results)

const derived = (g, step) => {
  const out = new Solid(newHandle(mat4.multiply(mat4.create(), step, handleOf(g).matrix)))
  if (isSolid(g) && g.color) out.color = g.color
  return out
}

// Like manifold's transforms: a new object per input, keeping only color.
const moving = (rawFn) => (lead, ...geoms) => single(geoms.flat(Infinity).map((g) => {
  if (g.points !== undefined) return rawFn(lead, g)
  return derived(g, rawFn(lead, geometries.path2.create()).transforms)
}))

const shifted = (g, offset) => derived(g, mat4.fromTranslation(mat4.create(), offset))
const boxCenter = ([min, max]) => min.map((v, i) => (v + max[i]) / 2)

const center = (options, ...geoms) => single(geoms.flat(Infinity).map((g) => {
  const axes = options.axes || [true, true, true]
  const to = options.relativeTo || [0, 0, 0]
  const c = boxCenter(g.boundingBox())
  return shifted(g, [0, 1, 2].map((i) => (axes[i] ? to[i] - c[i] : 0)))
}))

const align = (options, ...geoms) => single(geoms.flat(Infinity).map((g) => {
  const box = g.boundingBox()
  const c = boxCenter(box)
  return shifted(g, [0, 1, 2].map((i) => {
    const mode = options.modes[i]
    if (mode === 'min') return options.relativeTo[i] - box[0][i]
    if (mode === 'max') return options.relativeTo[i] - box[1][i]
    if (mode === 'center') return options.relativeTo[i] - c[i]
    return 0
  }))
}))

const boolean = (...geoms) => {
  const items = geoms.flat(Infinity)
  if (items.length === 1 && isSolid(items[0])) return items[0]
  items.forEach(handleOf)
  return new Solid(newHandle(handleOf(items[0]).matrix))
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
    transform: moving(modeling.transforms.transform),
    center,
    centerX: (...geoms) => center({ axes: [true, false, false] }, ...geoms),
    align
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

const solid = () => new Solid(newHandle(mat4.create()))
const AXIS = { axis: { origin: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] } }
const RAISED = { axis: { origin: [0, 0, 1], z: [0, 0, 1], x: [1, 0, 0] } }

test('anchors on manifold-shaped geometry', async (t) => {
  const api = await loadOver(fakeManifold)
  const { anchors, booleans, colors, transforms } = api
  const at = (origin, z = [0, 0, 1], x = [1, 0, 0]) => anchors.frame(origin, z, x)
  const placed = () => transforms.translate([5, 3, 2], anchors.withAnchors(solid(), RAISED))
  t.beforeEach(() => {
    polygonReads = 0
    owners = []
  })

  await t.test('withAnchors keeps the geometry class and its state', () => {
    const g = anchors.withAnchors(colors.colorize([1, 0, 0, 1], solid()), AXIS)
    assert.equal(g.isManifoldGeom3, true)
    assert.deepEqual(g.color, [1, 0, 0, 1])
    frameClose(anchors.anchor(g, 'axis'), at([0, 0, 0]))
    assert.equal(polygonReads, 0)
  })

  await t.test('a withAnchors copy owns its handle once the source is released', () => {
    const g = anchors.withAnchors(solid(), AXIS)
    releaseAllExcept(g)
    assert.equal(g.volume(), 8)
    frameClose(anchors.anchor(g, 'axis'), at([0, 0, 0]))
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

  await t.test('subtractAnchored with carry keeps carried frames on a result that owns its handle', () => {
    const cutter = transforms.translate([6, 2, 0], anchors.withAnchors(solid(), AXIS))
    const plate = booleans.subtract(solid(), cutter, { carry: { bolt1: cutter } })
    assert.equal(plate.isManifoldGeom3, true)
    releaseAllExcept(plate)
    assert.equal(plate.volume(), 8)
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

  await t.test('center moves frames with the geometry', () => {
    const g = transforms.center({}, placed())
    releaseAllExcept(g)
    assert.equal(g.volume(), 8)
    frameClose(anchors.anchor(g, 'axis'), at([0, 0, 1]))
    assert.equal(polygonReads, 0)
  })

  await t.test('centerX moves frames along x only', () => {
    frameClose(anchors.anchor(transforms.centerX(placed()), 'axis'), at([0, 3, 3]))
    assert.equal(polygonReads, 0)
  })

  await t.test('align moves frames with the geometry', () => {
    const g = transforms.align({ modes: ['min', 'none', 'none'], relativeTo: [10, 0, 0] }, placed())
    frameClose(anchors.anchor(g, 'axis'), at([11, 3, 3]))
    assert.equal(polygonReads, 0)
  })
})

test('over plain modeling, lazy transforms stay the raw functions', async () => {
  const api = await loadOver(modeling)
  assert.equal(api.transforms.translate, modeling.transforms.translate)
  assert.equal(api.colors.colorize, modeling.colors.colorize)
})
