'use strict'
const { canonicalName, parseDirection } = require('./names')
const { isAnchorable, worldFrames } = require('./storage')
const { defaultFrame } = require('./defaults')

const anchors = (geometry) => worldFrames(geometry)

const anchor = (geometry, nameOrVector) => {
  if (!isAnchorable(geometry)) throw new Error('anchor: geometry must be geom2 or geom3')
  const name = canonicalName(nameOrVector)
  const explicit = worldFrames(geometry)
  if (Object.hasOwn(explicit, name)) return explicit[name]
  const d = parseDirection(name)
  if (d) return defaultFrame(geometry, d)
  throw new Error(`anchor: unknown anchor "${name}"`)
}

module.exports = { anchors, anchor }
