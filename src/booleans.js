'use strict'
const { booleans, geometries, utils } = require('@jscad/modeling')
const { bake, basisOf, worldFrames, withWorldFrames } = require('./storage')

const merge = (target, frames, prefix) => {
  for (const [name, f] of Object.entries(frames)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (!Object.hasOwn(target, key)) target[key] = f
  }
}

const isOptions = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  basisOf(value) === undefined && !geometries.path2.isA(value)

const unionAnchored = (...geometries) => {
  const items = utils.flatten(geometries)
  items.forEach(bake)
  const result = booleans.union(items)
  const frames = {}
  for (const item of items) merge(frames, worldFrames(item))
  return withWorldFrames(result, frames)
}

const subtractAnchored = (...args) => {
  const options = isOptions(args[args.length - 1]) ? args.pop() : {}
  const items = utils.flatten(args)
  items.forEach(bake)
  const result = booleans.subtract(items)
  const frames = {}
  merge(frames, worldFrames(items[0]))
  for (const [prefix, tool] of Object.entries(options.carry || {})) {
    bake(tool)
    merge(frames, worldFrames(tool), prefix)
  }
  return withWorldFrames(result, frames)
}

const intersectAnchored = (...geometries) => {
  const items = utils.flatten(geometries)
  items.forEach(bake)
  const result = booleans.intersect(items)
  return withWorldFrames(result, Object.assign({}, worldFrames(items[0])))
}

module.exports = { unionAnchored, subtractAnchored, intersectAnchored }
