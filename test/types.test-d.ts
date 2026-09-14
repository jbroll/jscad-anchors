import { primitives, booleans, anchors, Frame, Frames, Connector } from '../src'

const plate = primitives.cuboid({ size: [20, 20, 2] })
const cyl = anchors.withAnchors(primitives.cylinder({ radius: 1, height: 4 }), { axis: anchors.frame([0, 0, 0], [0, 0, 1]) })
const holed = anchors.subtractAnchored(plate, cyl, { carry: { bolt1: cyl } })
const f: Frame = anchors.anchor(holed, 'bolt1.axis')
const byVector: Frame = anchors.anchor(holed, [0, 0, 1])
const frames: Frames = anchors(holed)
const placed = anchors.attach(cyl, 'axis', holed, 'bolt1.axis', { overlap: 1, flip: false, spin: 0 })
const aligned = anchors.alignTo(placed, plate, 'top+right', { inside: true, inset: 1 })
const merged = anchors.unionAnchored(plate, [aligned])
const cut = anchors.intersectAnchored(plate, aligned)
const arrows = anchors.anchorArrows(aligned, { length: 3 })
const [name, converted] = anchors.fromBosl2(['top', [0, 0, 1], [0, 0, 1], 0])
const c: Connector = anchors.toConnector(anchors.fromConnector({ point: [0, 0, 0], axis: [0, 0, 1], normal: [1, 0, 0] }))
booleans.union(plate, aligned)
const carried = booleans.subtract(plate, cyl, { carry: { bolt1: cyl } })
const arrowName: string = arrows[0].name

// @ts-expect-error spin must be a number
anchors.attach(cyl, 'axis', holed, 'top', { spin: '90' })

export { f, byVector, frames, merged, cut, arrows, name, converted, c, carried, arrowName }
