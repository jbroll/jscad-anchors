# jscad-anchors

Named frames (anchors) on JSCAD geometry, so parts are placed by attaching one
part's frame to another's instead of by hand-computed `translate`/`rotate`
numbers. Works with native [`@jscad/modeling`](https://github.com/jscad/OpenJSCAD.org)
models, and is intended for [jscad-fluent](https://github.com/jbroll/jscad-fluent)
and the OpenSCAD transpiler in [jscadui](https://github.com/jbroll/jscadui),
neither of which is integrated yet.

Version 0.1.0.

## Example

```js
const { primitives, booleans, transforms, anchors } = require('@jbroll/jscad-anchors')

const plate = transforms.translate([3, 4, 0], primitives.cuboid({ size: [20, 20, 2] }))
const cutter = transforms.translate([5, 0, 0], anchors.withAnchors(
  primitives.cylinder({ radius: 1, height: 4 }),
  { axis: anchors.frame([0, 0, 0], [0, 0, 1]) }))
const holed = booleans.subtract(plate, cutter, { carry: { bolt1: cutter } })

const bolt = anchors.withAnchors(primitives.cylinder({ radius: 0.9, height: 10 }), { tip: anchors.frame([0, 0, -5], [0, 0, -1]) })
const placed = anchors.attach(bolt, 'tip', holed, 'bolt1.axis', { flip: false })

console.log(anchors(placed).tip)
// { origin: [ 5, 0, 0 ], z: [ 0, 0, 1 ], x: [ 1, 0, 0 ] }
```

The cylinder that cuts the hole carries its `axis` anchor into the plate as
`bolt1.axis`. The bolt then attaches to that anchor and lands exactly on the
hole.

## Install

```
npm install @jbroll/jscad-anchors
```

`@jscad/modeling` (`>=2.12.0 <3`) is a peer dependency.

## Docs

- [`docs/quickstart.md`](docs/quickstart.md) — shortest path to one result
- [`docs/user-manual.md`](docs/user-manual.md) — every export and behavior
- [`docs/install.md`](docs/install.md) — requirements and setup
- [`docs/architecture.md`](docs/architecture.md) — module map and design decisions
- [`docs/development.md`](docs/development.md) — repo layout, tests, conventions
- [`docs/backlog.md`](docs/backlog.md) — outstanding work
