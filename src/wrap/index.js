'use strict'
const raw = require('@jscad/modeling')
const { classify } = require('./groups')
const { bakeAll, basisOf, cloneManifold, isManifold, worldFrames, withWorldFrames } = require('../storage')
const { transformFrame, mapFrames } = require('../frame')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../booleans')

const { flatten } = raw.utils
const { geom2, path2 } = raw.geometries
const { mat4 } = raw.maths

const boxCenter = ([min, max]) => [0, 1, 2].map((k) => ((min[k] || 0) + (max[k] || 0)) / 2)

// Manifold's transforms and colorize return new objects that keep only color, so lazy results lose anchors.
const lazyDropsFields = typeof raw.geometries.isManifoldGeom3 === 'function'

const mapResults = (result, fn) => (Array.isArray(result) ? result.map(fn) : fn(result, 0))

const inSync = (out) => out.anchors && out.anchors.basis === basisOf(out)

const carry = (input, out, fn) => {
  if (!input || !input.anchors || !out || basisOf(out) === undefined || out === input || inSync(out)) return out
  return withWorldFrames(out, mapFrames(worldFrames(input), fn))
}

const carryAll = (inputs, result, fn) => mapResults(result, (out, i) => carry(inputs[i], out, fn))

const matrixOf = (fn, path, lead, args) => {
  // A tree node stores its affine matrix at construction; reading it avoids
  // building a throwaway node through the engine.
  const operand = path === 'geometries.geom2.transform' ? args[1] : args[lead]
  if (operand && operand.isTreeNode === true && operand.matrix) return operand.matrix
  return path === 'geometries.geom2.transform'
    ? args[0]
    : fn(...args.slice(0, lead), path2.create()).transforms
}

// A tagged tree node carries frames too; the outer wrap must see it as anchored.
const anchoredManifold = (g) => Boolean(g && g.anchors) && (isManifold(g) || g.isTreeNode === true)

const stripStale = (out) => {
  if (!out || !out.anchors || inSync(out)) return out
  if (isManifold(out)) return cloneManifold(out)
  const { anchors, ...rest } = out
  return rest
}

const WRAPPERS = {
  none: (fn) => fn,
  lazy: (fn, { path, lead }) => {
    if (!lazyDropsFields || lead === 0) return fn
    return (...args) => {
      const inputs = flatten(args.slice(lead))
      const result = fn(...args)
      if (!inputs.some(anchoredManifold)) return result
      if (!path.startsWith('transforms.')) return carryAll(inputs, result, (f) => f)
      const matrix = matrixOf(fn, path, lead, args)
      return carryAll(inputs, result, (f) => transformFrame(matrix, f))
    }
  },
  bake: (fn, { path, lead }) => {
    const baked = (...args) => {
      bakeAll(args)
      return fn(...args)
    }
    if (!lazyDropsFields || !path.startsWith('transforms.')) return baked
    // Manifold's center and align rebuild geometry from a translated handle, keeping only color.
    return (...args) => {
      const inputs = flatten(args.slice(lead))
      const result = baked(...args)
      if (!inputs.some(anchoredManifold)) return result
      return mapResults(result, (out, i) => {
        if (!anchoredManifold(inputs[i]) || !isManifold(out)) return out
        const [from, to] = [inputs[i], out].map((g) => boxCenter(g.boundingBox()))
        const move = mat4.fromTranslation(mat4.create(), [0, 1, 2].map((k) => to[k] - from[k]))
        return carry(inputs[i], out, (f) => transformFrame(move, f))
      })
    }
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
    if (!inputs.some((g) => anchoredManifold(g) || (!isManifold(g) && geom2.isA(g) && g.anchors))) return result
    const matrix = matrixOf(fn, path, lead, args)
    return carryAll(inputs, result, (f) => transformFrame(matrix, f))
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

module.exports = Object.assign(wrapTree(raw, ''), { wrapTree })
