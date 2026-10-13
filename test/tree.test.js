'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const {
  basisOf, isAnchorable, localFrames, worldFrames, withAnchors, withWorldFrames, bake
} = require('../src/storage')
const { isOptions } = require('../src/booleans')
const { resolveAnchor, attach, alignTo } = require('../src/place')

const node = (op, dim, extra = {}) => Object.assign({
  op,
  params: {},
  children: [],
  isTreeNode: true,
  dim,
  overlay: null,
  anchors: null,
  color: null
}, extra)

test('withWorldFrames spreads a node and tags frames', () => {
  const cube = node('primitives.cube', 3)
  const out = withWorldFrames(cube, { top: frame([0, 0, 5], [0, 0, 1], [1, 0, 0]) })
  assert.equal(out.op, 'primitives.cube')
  assert.deepEqual(out.anchors.frames.top.origin, [0, 0, 5])
  assert.equal(out.anchors.basis, 'tree')
  assert.equal(cube.anchors, null)
})

test('basisOf reports tree for tagged nodes and tree-bare for bare geometry nodes', () => {
  const bare = node('primitives.cube', 3)
  assert.equal(basisOf(bare), 'tree-bare')
  assert.equal(isAnchorable(bare), true)
  const tagged = withAnchors(bare, { top: frame([0, 0, 0], [0, 0, 1]) })
  assert.equal(basisOf(tagged), 'tree')
  close(localFrames(tagged).top.origin, [0, 0, 0])
  assert.equal(basisOf(node('literal', undefined)), undefined)
  assert.equal(isAnchorable(node('literal', undefined)), false)
})

test('worldFrames on a node reads the tag frames with no staleness check', () => {
  const tagged = withWorldFrames(node('primitives.cube', 3), { a: frame([1, 2, 3], [0, 0, 1]) })
  close(worldFrames(tagged).a.origin, [1, 2, 3])
})

test('bake leaves a node unchanged', () => {
  const tagged = withAnchors(node('primitives.cube', 3), { top: frame([0, 0, 0], [0, 0, 1]) })
  assert.equal(bake(tagged), tagged)
})

test('subtract trailing node is not options', () => {
  assert.equal(isOptions(node('primitives.cube', 3)), false)
  assert.equal(isOptions({ carry: {} }), true)
})

test('resolveAnchor reads an explicit node frame without evaluating', () => {
  const tagged = withAnchors(node('primitives.cube', 3), { top: frame([0, 0, 1], [0, 0, 1], [1, 0, 0]) })
  const ref = resolveAnchor(tagged, 'top')
  close(ref.frame.origin, [0, 0, 1])
  assert.equal(ref.node, undefined)
})

test('resolveAnchor defers a directional node anchor', () => {
  const cube = node('primitives.cube', 3)
  const ref = resolveAnchor(cube, 'bottom')
  assert.equal(ref.node, cube)
  assert.deepEqual(ref.direction, [0, 0, -1])
  assert.ok(ref.basis.z)
  assert.equal(ref.frame, undefined)
})

test('attach on nodes emits a deferred attach descriptor node', () => {
  const parent = withAnchors(node('primitives.cuboid', 3), { top: frame([0, 0, 1], [0, 0, 1], [1, 0, 0]) })
  const child = node('primitives.cube', 3)
  const out = attach(child, 'bottom', parent, 'top', { flip: false })
  assert.equal(out.isTreeNode, true)
  assert.equal(out.op, 'attach')
  assert.equal(out.params.child, child)
  assert.equal(out.params.parent, parent)
  close(out.params.parentAnchor.frame.origin, [0, 0, 1])
  assert.deepEqual(out.params.childAnchor.direction, [0, 0, -1])
  assert.equal(out.params.flip, false)
  assert.equal(out.dim, 3)
  assert.equal(child.anchors, null)
  assert.equal(parent.anchors.frames.top.origin[2], 1)
})

test('alignTo on nodes emits a deferred alignTo node', () => {
  const child = node('primitives.cube', 3)
  const parent = node('primitives.cuboid', 3)
  const out = alignTo(child, parent, 'top')
  assert.equal(out.isTreeNode, true)
  assert.equal(out.op, 'alignTo')
  assert.equal(out.params.child, child)
  assert.equal(out.params.parent, parent)
  assert.equal(out.params.direction, 'top')
  assert.equal(out.dim, 3)
})

test('attach and alignTo on real geometry stay eager', () => {
  const cube = () => raw.primitives.cuboid({ size: [4, 4, 4] })
  const plate = () => raw.primitives.cuboid({ size: [10, 10, 10] })
  assert.equal(attach(cube(), 'bottom', plate(), 'top').isTreeNode, undefined)
  assert.equal(alignTo(cube(), plate(), 'top').isTreeNode, undefined)
})

const loadModelTree = async () => {
  const specs = []
  if (process.env.JSCAD_MODEL_TREE) specs.push(process.env.JSCAD_MODEL_TREE)
  specs.push('@jscadui/model-tree')
  for (const spec of specs) {
    try {
      return await import(spec)
    } catch (err) {
      if (err && err.code !== 'ERR_MODULE_NOT_FOUND' && err.code !== 'MODULE_NOT_FOUND') throw err
    }
  }
  return null
}

test('anchored equivalence: tree attach matches eager real-geometry attach', async (t) => {
  const modelTree = await loadModelTree()
  if (!modelTree) {
    t.skip('@jscadui/model-tree not resolvable here; set JSCAD_MODEL_TREE to its src/index.js')
    return
  }
  const { createModelTree, createEvaluator } = modelTree
  const anchors = require('../src').anchors

  const realPlate = anchors.withAnchors(
    raw.primitives.cuboid({ size: [10, 10, 2] }), { top: frame([0, 0, 1], [0, 0, 1], [1, 0, 0]) })
  const eager = anchors.attach(raw.primitives.cube({ size: 2 }), 'bottom', realPlate, 'top', { flip: false })

  const tree = createModelTree(raw, { anchors: true })
  const treePlate = anchors.withAnchors(
    tree.primitives.cuboid({ size: [10, 10, 2] }), { top: frame([0, 0, 1], [0, 0, 1], [1, 0, 0]) })
  const symbolic = anchors.attach(
    tree.primitives.cube({ size: 2 }), 'bottom', treePlate, 'top', { flip: false })
  assert.equal(symbolic.isTreeNode, true)
  assert.equal(symbolic.op, 'attach')

  const evaluate = createEvaluator(raw)
  const { solids } = await evaluate(symbolic, new Map())
  assert.equal(solids.length, 1)

  const [emin, emax] = raw.measurements.measureBoundingBox(eager)
  const [smin, smax] = raw.measurements.measureBoundingBox(solids[0])
  close(smin, emin)
  close(smax, emax)
  close([raw.measurements.measureVolume(solids[0])], [raw.measurements.measureVolume(eager)])
})

// `frames` from the tag are plain frozen arrays; frameClose guards the orientation too.
test('tagged node frames keep their orientation', () => {
  const tagged = withAnchors(node('primitives.cube', 3), { top: frame([0, 0, 1], [0, 0, 1], [1, 0, 0]) })
  frameClose(worldFrames(tagged).top, frame([0, 0, 1], [0, 0, 1], [1, 0, 0]))
})
