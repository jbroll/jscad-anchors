'use strict'
const { maths } = require('@jscad/modeling')
const { vec3 } = maths
const { frame, rotationFromUp } = require('./frame')

const fromBosl2 = ([name, pos, orient, spin = 0]) => {
  const a = (spin * Math.PI) / 180
  const x = vec3.transform(vec3.create(), [Math.cos(a), Math.sin(a), 0], rotationFromUp(orient))
  return [name, frame(pos, orient, x)]
}

const fromConnector = ({ point, axis, normal }) => frame(point, axis, normal)

const toConnector = (f) => ({ point: [...f.origin], axis: [...f.z], normal: [...f.x] })

module.exports = { fromBosl2, fromConnector, toConnector }
