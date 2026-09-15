'use strict'

const GROUPS = ['none', 'lazy', 'bake', 'matrix', 'keep', 'drop', 'union', 'subtract', 'intersect']

const PREFIXES = {
  maths: 'none',
  curves: 'none',
  primitives: 'none',
  text: 'none',
  utils: 'none',
  'geometries.path2': 'none',
  'geometries.poly2': 'none',
  'geometries.poly3': 'none',
  'extrusions.slice': 'none'
}

const TABLE = {
  'colors.colorize': ['lazy', 1, 1],
  'colors.colorNameToRgb': ['none', 1],
  'colors.hexToRgb': ['none', 1],
  'colors.hslToRgb': ['none', 0],
  'colors.hsvToRgb': ['none', 0],
  'colors.hueToColorComponent': ['none', 3],
  'colors.rgbToHex': ['none', 0],
  'colors.rgbToHsl': ['none', 0],
  'colors.rgbToHsv': ['none', 0],

  'geometries.geom2.clone': ['lazy', 1],
  'geometries.geom2.create': ['none', 1],
  'geometries.geom2.fromPoints': ['none', 1],
  'geometries.geom2.fromCompactBinary': ['none', 1],
  'geometries.geom2.isA': ['none', 1],
  'geometries.geom2.reverse': ['keep', 1, 0],
  'geometries.geom2.toOutlines': ['bake', 1],
  'geometries.geom2.toPoints': ['bake', 1],
  'geometries.geom2.toSides': ['bake', 1],
  'geometries.geom2.toString': ['bake', 1],
  'geometries.geom2.toCompactBinary': ['bake', 1],
  'geometries.geom2.transform': ['matrix', 2, 1],
  'geometries.geom2.validate': ['none', 1],

  'geometries.geom3.clone': ['lazy', 1],
  'geometries.geom3.create': ['none', 1],
  'geometries.geom3.fromPointsConvex': ['none', 1],
  'geometries.geom3.fromPoints': ['none', 1],
  'geometries.geom3.fromCompactBinary': ['none', 1],
  'geometries.geom3.invert': ['keep', 1, 0],
  'geometries.geom3.isA': ['none', 1],
  'geometries.geom3.isConvex': ['bake', 1],
  'geometries.geom3.toPoints': ['bake', 1],
  'geometries.geom3.toPolygons': ['bake', 1],
  'geometries.geom3.toString': ['bake', 1],
  'geometries.geom3.toCompactBinary': ['bake', 1],
  'geometries.geom3.transform': ['lazy', 2],
  'geometries.geom3.validate': ['none', 1],

  'measurements.measureAggregateArea': ['bake', 0],
  'measurements.measureAggregateBoundingBox': ['bake', 0],
  'measurements.measureAggregateEpsilon': ['bake', 0],
  'measurements.measureAggregateVolume': ['bake', 0],
  'measurements.measureArea': ['bake', 0],
  'measurements.measureBoundingBox': ['bake', 0],
  'measurements.measureBoundingSphere': ['bake', 0],
  'measurements.measureCenter': ['bake', 0],
  'measurements.measureCenterOfMass': ['bake', 0],
  'measurements.measureDimensions': ['bake', 0],
  'measurements.measureEpsilon': ['bake', 0],
  'measurements.measureVolume': ['bake', 0],

  'booleans.intersect': ['intersect', 0],
  'booleans.minkowski': ['drop', 0],
  'booleans.scission': ['drop', 0],
  'booleans.subtract': ['subtract', 0],
  'booleans.union': ['union', 0],

  'expansions.expand': ['drop', 1],
  'expansions.offset': ['drop', 1],

  'extrusions.extrudeFromSlices': ['drop', 2],
  'extrusions.extrudeLinear': ['drop', 1],
  'extrusions.extrudeRectangular': ['drop', 1],
  'extrusions.extrudeRotate': ['drop', 2],
  'extrusions.extrudeHelical': ['drop', 2],
  'extrusions.project': ['drop', 1],

  'hulls.hull': ['drop', 0],
  'hulls.hullChain': ['drop', 0],
  'hulls.hullPoints2': ['none', 1],
  'hulls.hullPoints3': ['none', 1],

  'minkowski.minkowskiSum': ['drop', 0],

  'modifiers.generalize': ['keep', 1, 1],
  'modifiers.snap': ['keep', 0, 0],
  'modifiers.retessellate': ['keep', 1, 0],

  'transforms.align': ['bake', 1],
  'transforms.center': ['bake', 1],
  'transforms.centerX': ['bake', 0],
  'transforms.centerY': ['bake', 0],
  'transforms.centerZ': ['bake', 0],
  'transforms.mirror': ['matrix', 1, 1],
  'transforms.mirrorX': ['matrix', 0, 0],
  'transforms.mirrorY': ['matrix', 0, 0],
  'transforms.mirrorZ': ['matrix', 0, 0],
  'transforms.rotate': ['matrix', 1, 1],
  'transforms.rotateX': ['matrix', 1, 1],
  'transforms.rotateY': ['matrix', 1, 1],
  'transforms.rotateZ': ['matrix', 1, 1],
  'transforms.scale': ['matrix', 1, 1],
  'transforms.scaleX': ['matrix', 1, 1],
  'transforms.scaleY': ['matrix', 1, 1],
  'transforms.scaleZ': ['matrix', 1, 1],
  'transforms.transform': ['matrix', 1, 1],
  'transforms.translate': ['lazy', 1, 1],
  'transforms.translateX': ['lazy', 1, 1],
  'transforms.translateY': ['lazy', 1, 1],
  'transforms.translateZ': ['lazy', 1, 1]
}

const classify = (path) => {
  const entry = TABLE[path]
  if (entry) return { group: entry[0], arity: entry[1], lead: entry[2] || 0 }
  const prefix = Object.keys(PREFIXES)
    .filter((p) => path.startsWith(`${p}.`))
    .sort((a, b) => b.length - a.length)[0]
  return prefix ? { group: PREFIXES[prefix], lead: 0 } : undefined
}

module.exports = { GROUPS, PREFIXES, TABLE, classify }
