'use strict'
const modeling = require('./wrap')
const { frame } = require('./frame')
const { withAnchors } = require('./storage')
const lookup = require('./lookup')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('./booleans')
const { attach, alignTo } = require('./place')
const { anchorArrows } = require('./debug')
const { fromBosl2, fromConnector, toConnector } = require('./convert')

const anchors = Object.assign((geometry) => lookup.anchors(geometry), {
  frame,
  withAnchors,
  anchor: lookup.anchor,
  attach,
  alignTo,
  unionAnchored,
  subtractAnchored,
  intersectAnchored,
  anchorArrows,
  fromBosl2,
  fromConnector,
  toConnector
})

const {
  colors, curves, geometries, maths, measurements, primitives, text, utils,
  booleans, expansions, extrusions, hulls, minkowski, modifiers, transforms
} = modeling

// An object literal of identifiers lets Node's ESM loader detect named exports.
module.exports = {
  colors, curves, geometries, maths, measurements, primitives, text, utils,
  booleans, expansions, extrusions, hulls, minkowski, modifiers, transforms,
  anchors
}
