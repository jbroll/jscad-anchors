'use strict'
const { geometries, maths } = require('@jscad/modeling')
const { frame, transformFrame, mapFrames } = require('./frame')
const { canonicalName } = require('./names')

const { geom2, geom3 } = geometries
const { mat4 } = maths

const BAKED_OUTSIDE = 'geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors'

const isManifold = (geometry) =>
  Boolean(geometry) && (geometry.isManifoldGeom3 === true || geometry.isManifoldGeom2 === true)

// Manifold geometry never bakes in place, and reading polygons or sides would convert the whole mesh.
const manifoldBasis = (geometry) => {
  if (geometry.isManifoldGeom3 === true) return geometry.manifold
  return geometry.hasJscadSource ? geometry.jscadGeom2 : geometry.crossSection
}

// A plain copy loses manifold's private mesh fields and prototype getters; clone shares them.
const cloneManifold = (geometry, anchors) => {
  const out = geometry.clone()
  for (const key of Object.keys(geometry)) {
    if (key !== 'anchors') Reflect.set(out, key, geometry[key])
  }
  if (anchors) out.anchors = anchors
  return out
}

const copyWithAnchors = (geometry, anchors) =>
  isManifold(geometry) ? cloneManifold(geometry, anchors) : Object.assign({}, geometry, { anchors })

const basisOf = (geometry) => {
  if (isManifold(geometry)) return manifoldBasis(geometry)
  if (geom3.isA(geometry)) return geometry.polygons
  if (geom2.isA(geometry)) return geometry.sides
  return undefined
}

const isAnchorable = (geometry) => basisOf(geometry) !== undefined

const localFrames = (geometry) => {
  const anchors = geometry && geometry.anchors
  if (!anchors) return Object.freeze({})
  if (basisOf(geometry) !== anchors.basis) throw new Error(BAKED_OUTSIDE)
  return anchors.frames
}

const worldFrames = (geometry) => {
  const local = localFrames(geometry)
  if (!geometry || !geometry.transforms || mat4.isIdentity(geometry.transforms)) return local
  return mapFrames(local, (f) => transformFrame(geometry.transforms, f))
}

const withAnchors = (geometry, frames) => {
  const basis = basisOf(geometry)
  if (!basis) throw new Error('withAnchors: geometry must be geom2 or geom3')
  const merged = Object.assign({}, localFrames(geometry))
  for (const [name, f] of Object.entries(frames)) merged[canonicalName(name)] = frame(f.origin, f.z, f.x)
  return copyWithAnchors(geometry, { frames: Object.freeze(merged), basis })
}

const withWorldFrames = (geometry, frames) => {
  if (Object.keys(frames).length === 0 && !geometry.anchors) return geometry
  return copyWithAnchors(geometry, { frames: Object.freeze(Object.assign({}, frames)), basis: basisOf(geometry) })
}

const bake = (geometry) => {
  if (!geometry || !geometry.anchors || !isAnchorable(geometry)) return geometry
  const frames = worldFrames(geometry)
  if (mat4.isIdentity(geometry.transforms)) return geometry
  if (geom3.isA(geometry)) geom3.toPolygons(geometry)
  else geom2.toSides(geometry)
  geometry.anchors = { frames, basis: basisOf(geometry) }
  return geometry
}

const bakeAll = (args) => {
  for (const arg of args) {
    if (Array.isArray(arg)) bakeAll(arg)
    else bake(arg)
  }
}

module.exports = {
  BAKED_OUTSIDE, isManifold, cloneManifold, basisOf, isAnchorable, localFrames, worldFrames, withAnchors, withWorldFrames, bake, bakeAll
}
