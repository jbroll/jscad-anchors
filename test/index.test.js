'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { close } = require('./helpers')
const jscad = require('../src')

const { primitives, booleans, transforms, anchors } = jscad

test('re-exports modeling namespaces', () => {
  for (const ns of ['colors', 'curves', 'geometries', 'maths', 'measurements', 'primitives', 'text', 'utils',
    'booleans', 'expansions', 'extrusions', 'hulls', 'minkowski', 'modifiers', 'transforms']) {
    assert.equal(typeof jscad[ns], 'object', ns)
  }
  assert.equal(booleans.union, anchors.unionAnchored)
})

test('ESM import sees every export by name', async () => {
  const esm = await import('../src/index.js')
  const expected = [...Object.keys(require('@jscad/modeling')), 'anchors', 'default']
  // Node 23+ adds 'module.exports' to every CommonJS module's ESM namespace.
  const names = Object.keys(esm).filter((name) => name !== 'module.exports')
  assert.deepEqual(names.sort(), expected.sort())
})

test('anchors is a function with the API as properties', () => {
  for (const name of ['frame', 'withAnchors', 'anchor', 'attach', 'alignTo', 'unionAnchored', 'subtractAnchored',
    'intersectAnchored', 'anchorArrows', 'fromBosl2', 'fromConnector', 'toConnector']) {
    assert.equal(typeof anchors[name], 'function', name)
  }
})

test('anchors() rejects non-anchorable geometry', () => {
  assert.throws(() => anchors(jscad.geometries.path2.create()), /anchors: geometry must be geom2 or geom3/)
})

test('a bolt placed through a carried hole lines up', () => {
  const plate = transforms.translate([3, 4, 0], primitives.cuboid({ size: [20, 20, 2] }))
  const cutter = transforms.translate([5, 0, 0], anchors.withAnchors(
    primitives.cylinder({ radius: 1, height: 4 }),
    { axis: anchors.frame([0, 0, 0], [0, 0, 1]) }))
  const holed = booleans.subtract(plate, cutter, { carry: { bolt1: cutter } })
  const bolt = anchors.withAnchors(primitives.cylinder({ radius: 0.9, height: 10 }), { tip: anchors.frame([0, 0, -5], [0, 0, -1]) })
  const placed = anchors.attach(bolt, 'tip', holed, 'bolt1.axis', { flip: false })
  close(anchors(placed).tip.origin, [5, 0, 0])
  close(anchors(placed).tip.z, [0, 0, 1])
})
