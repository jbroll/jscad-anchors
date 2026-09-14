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

module.exports = Object.assign({}, modeling, { anchors })
