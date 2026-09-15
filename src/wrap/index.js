'use strict'
const raw = require('@jscad/modeling')
const { classify } = require('./groups')
const { bakeAll, basisOf, worldFrames, withWorldFrames } = require('../storage')
const { transformFrame, mapFrames } = require('../frame')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../booleans')

const { flatten } = raw.utils
const { geom2, path2 } = raw.geometries

const mapResults = (result, fn) => (Array.isArray(result) ? result.map(fn) : fn(result, 0))

const inSync = (out) => out.anchors && out.anchors.basis === basisOf(out)

const carry = (input, out, fn) => {
  if (!input || !input.anchors || !out || basisOf(out) === undefined || out === input || inSync(out)) return out
  return withWorldFrames(out, mapFrames(worldFrames(input), fn))
}

const stripStale = (out) => {
  if (!out || !out.anchors || inSync(out)) return out
  const { anchors, ...rest } = out
  return rest
}

const WRAPPERS = {
  none: (fn) => fn,
  lazy: (fn) => fn,
  bake: (fn) => (...args) => {
    bakeAll(args)
    return fn(...args)
  },
  drop: (fn) => (...args) => {
    bakeAll(args)
    return mapResults(fn(...args), stripStale)
  },
  keep: (fn, { lead }) => (...args) => {
    bakeAll(args)
    const inputs = flatten(args.slice(lead))
    return mapResults(fn(...args), (out, i) => carry(inputs[i], out, (f) => f))
  },
  matrix: (fn, { path, lead }) => (...args) => {
    const inputs = flatten(args.slice(lead))
    const result = fn(...args)
    if (!inputs.some((g) => geom2.isA(g) && g.anchors)) return result
    const matrix = path === 'geometries.geom2.transform'
      ? args[0]
      : fn(...args.slice(0, lead), path2.create()).transforms
    return mapResults(result, (out, i) => carry(inputs[i], out, (f) => transformFrame(matrix, f)))
  },
  union: () => unionAnchored,
  subtract: () => subtractAnchored,
  intersect: () => intersectAnchored
}

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// The viewer's require sets exports.default = exports, so the tree can contain itself.
const wrapTree = (node, prefix, wrapped = new Map()) => {
  const out = {}
  wrapped.set(node, out)
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') {
      const entry = classify(path)
      out[key] = entry ? WRAPPERS[entry.group](value, { path, ...entry }) : value
    } else if (wrapped.has(value)) {
      out[key] = wrapped.get(value)
    } else if (isPlainObject(value)) {
      out[key] = wrapTree(value, path, wrapped)
    } else {
      out[key] = value
    }
  }
  return out
}

module.exports = wrapTree(raw, '')
