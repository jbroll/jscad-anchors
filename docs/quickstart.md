# Quickstart

## Setup

`@jbroll/jscad-anchors` is developed against a sibling checkout of the
`fork-main` branch of [jbroll/OpenJSCAD.org](https://github.com/jbroll/OpenJSCAD.org):

```
../OpenJSCAD.org        # fork-main branch, packages/modeling
../jscad-anchors         # this repository
```

```
cd jscad-anchors
npm install
```

## One result

Attach a 10x10x5 cuboid on top of a 20x20x5 cuboid by their `bottom`/`top`
default anchors, then print the placed part's `bottom` frame:

```js
const { primitives, anchors } = require('@jbroll/jscad-anchors')

const base = primitives.cuboid({ size: [20, 20, 5] })
const top = primitives.cuboid({ size: [10, 10, 5] })

const placed = anchors.attach(top, 'bottom', base, 'top')

console.log(anchors.anchor(placed, 'bottom'))
```

Prints:

```
{ origin: [ 0, 0, 2.5 ], z: [ 0, 0, -1 ], x: [ -1, 0, 0 ] }
```

`bottom` sits at the top of the base part (`z` = 2.5, half the base height),
and its `z` axis points down, out of the top part, opposite the base's `top`
anchor it was attached to.

See [`docs/user-manual.md`](user-manual.md) for every export and behavior.
