'use strict'
const m = require('./wrap')
const { anchor } = require('./lookup')
const { frameToMat4, transformFrame, mapFrames } = require('./frame')
const { basisOfDirection } = require('./defaults')
const { isTreeNode, worldFrames, TREE_BASIS } = require('./storage')
const { canonicalName, parseDirection } = require('./names')

const { mat4 } = m.maths
const multiply = (...matrices) => matrices.reduce((a, b) => mat4.multiply(mat4.create(), a, b))

// Explicit named frame on a node reads the tag; a directional name on a node
// stays a lazy descriptor. Real geometry keeps the eager lookup by name.
const resolveAnchor = (geometry, ref) => {
  if (!isTreeNode(geometry)) return { frame: anchor(geometry, ref) }
  const name = canonicalName(ref)
  const explicit = worldFrames(geometry)
  if (Object.hasOwn(explicit, name)) return { frame: explicit[name] }
  const d = parseDirection(name)
  if (d) return { node: geometry, direction: d, basis: basisOfDirection(d) }
  throw new Error(`resolveAnchor: unknown anchor "${name}"`)
}

const attachMatrix = (parentFrame, childFrame, overlap, flip, spin) => multiply(
  frameToMat4(parentFrame),
  mat4.fromTranslation(mat4.create(), [0, 0, -overlap]),
  flip ? mat4.fromYRotation(mat4.create(), Math.PI) : mat4.create(),
  mat4.fromZRotation(mat4.create(), spin),
  mat4.invert(mat4.create(), frameToMat4(childFrame))
)

// A concrete child frame lets the whole attach fold into one transform node,
// carrying the child's frames through the matrix; otherwise it stays deferred.
const attachTransformNode = (child, matrix) => {
  const frames = mapFrames(worldFrames(child), (f) => transformFrame(matrix, f))
  const pending = child.anchors && Array.isArray(child.anchors.pending) ? child.anchors.pending : []
  const anchors = Object.keys(frames).length || pending.length
    ? { frames, pending, basis: TREE_BASIS }
    : null
  return {
    op: 'transforms.transform',
    params: matrix,
    matrix: Array.from(matrix),
    children: [child],
    isTreeNode: true,
    dim: child.dim,
    overlay: null,
    anchors,
    color: null
  }
}

const attachNodes = (child, childAnchor, parent, parentAnchor, { overlap, flip, spin }) => {
  const childRef = resolveAnchor(child, childAnchor)
  const parentRef = resolveAnchor(parent, parentAnchor)
  if (childRef.frame && parentRef.frame) {
    const M = attachMatrix(parentRef.frame, childRef.frame, overlap, flip, spin)
    return isTreeNode(child) ? attachTransformNode(child, M) : m.transforms.transform(M, child)
  }
  return {
    op: 'attach',
    params: { child, parent, childAnchor: childRef, parentAnchor: parentRef, overlap, flip, spin },
    children: [child, parent],
    isTreeNode: true,
    dim: child.dim || parent.dim,
    overlay: null,
    anchors: null,
    color: null
  }
}

const attach = (child, childAnchor, parent, parentAnchor, { overlap = 0, flip = true, spin = 0 } = {}) => {
  if (isTreeNode(child) || isTreeNode(parent)) {
    return attachNodes(child, childAnchor, parent, parentAnchor, { overlap, flip, spin })
  }
  const P = anchor(parent, parentAnchor)
  const C = anchor(child, childAnchor)
  const M = attachMatrix(P, C, overlap, flip, spin)
  return m.transforms.transform(M, child)
}

const alignTo = (child, parent, direction, { inset = 0, inside = false } = {}) => {
  const d = parseDirection(canonicalName(direction))
  if (!d) throw new Error(`alignTo: not a direction: ${direction}`)
  if (isTreeNode(child) || isTreeNode(parent)) {
    return {
      op: 'alignTo',
      params: { child, parent, direction, inset, inside },
      children: [child, parent],
      isTreeNode: true,
      dim: child.dim || parent.dim,
      overlay: null,
      anchors: null,
      color: null
    }
  }
  const [cmin, cmax] = m.measurements.measureBoundingBox(child)
  const [pmin, pmax] = m.measurements.measureBoundingBox(parent)
  const offset = [0, 1, 2].map((i) => {
    if (d[i] === 0) return (pmin[i] + pmax[i]) / 2 - (cmin[i] + cmax[i]) / 2
    if (d[i] > 0) return pmax[i] - inset - (inside ? cmax[i] : cmin[i])
    return pmin[i] + inset - (inside ? cmin[i] : cmax[i])
  })
  return m.transforms.translate(offset, child)
}

module.exports = { resolveAnchor, attach, alignTo }
