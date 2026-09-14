'use strict'
const modeling = require('./wrap')
const { frame } = require('./frame')
const { withAnchors, worldFrames } = require('./storage')
const { anchor } = require('./lookup')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('./booleans')
const { attach, alignTo } = require('./place')
const { anchorArrows } = require('./debug')
const { fromBosl2, fromConnector, toConnector } = require('./convert')

const anchors = Object.assign((geometry) => worldFrames(geometry), {
  frame,
  withAnchors,
  anchor,
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
