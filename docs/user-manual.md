# User manual

All examples assume:

```js
const { primitives, booleans, transforms, measurements, anchors } = require('@jbroll/jscad-anchors')
```

## Frames

A frame is a right-handed orthonormal basis at a point, in the geometry's own
local space, millimeters and radians:

```js
{ origin: [x, y, z], z: [zx, zy, zz], x: [xx, xy, xz] }
```

`z` is the meaning of the anchor: a face normal, a hole axis, a slide
direction. `x` fixes rotation about `z`. `y` is not stored; it is
`cross(z, x)`.

`anchors.frame(origin, z, x)` builds one:

- `z` is normalized. `origin` and `z` are required; `z` must be non-zero.
- `x`, if given, is made orthogonal to `z`: `x = normalize(x - dot(x, z) * z)`.
- If `x` is omitted, or is parallel to `z` (so the orthogonalized vector is
  too short to normalize), `x` is replaced by BOSL2's spin-0 reference for
  that `z`: the `x` axis rotated the same way `[0, 0, 1]` (UP) would need to
  rotate to reach `z`, using BACK (`[0, 1, 0]`) as the rotation axis when `z`
  is DOWN.
- Frames are immutable (`Object.freeze`d, including `origin`, `z`, `x`).
  Every operation returns a new frame.

## Names

An anchor name is a string. Direction anchors are built from BOSL2 direction
words:

| axis | positive | negative |
|---|---|---|
| x | `right` | `left` |
| y | `back` | `front` (alias `fwd`, `forward`) |
| z | `top` (alias `up`) | `bottom` (alias `bot`, `down`) |

A direction with more than one nonzero component joins its words with `+` in
canonical `z, y, x` order: `top+right`, `top+front+left`. `center` (the
origin, `z = [0, 0, 1]`) is the zero vector.

A lookup also accepts a direction vector with components in `{-1, 0, 1}`,
such as `[0, 0, 1]`, which is canonicalized to `top`. A vector with any other
component throws.

## Storing and reading frames

`withAnchors(geometry, { name: frame, ... })` returns a new geom2 or geom3
with the given frames added, in the geometry's own local space (not world
space). Frames merge with any the geometry already has; a name given twice
keeps the later value. Direction names are canonicalized on the way in, so
`withAnchors(g, { 'right+top': f })` and a later `withAnchors(g, { 'top+right': f2 })`
overwrite the same anchor. Calling it on a `path2` or anything without
polygons/sides throws `withAnchors: geometry must be geom2 or geom3`.

`anchors(geometry)` (the package's default export, called directly) returns
`{ name: worldFrame }` for the geometry's **explicit** frames only — not the
27 defaults.

`anchors.anchor(geometry, ref)` looks up one frame by name or direction
vector, in world space:

1. If `ref` names an explicit anchor, that frame is returned.
2. Otherwise, if `ref` is a direction name or vector, the default anchor for
   that direction is computed (see below).
3. Otherwise it throws `anchor: unknown anchor "<name>"`.

Both `anchors()` and `anchors.anchor()` throw `anchor: geometry must be geom2
or geom3` for anything else, and both convert local frames to world space by
composing them with the geometry's current `transforms` matrix.

## Default anchors

Every geom2 and geom3 has 27 direction anchors available without
declaration, computed from its bounding box:

- `origin = center + d ⊙ halfExtent`, for direction `d` with components in
  `{-1, 0, 1}`. `z = normalize(d)`.
- `center` has `z = [0, 0, 1]`, `x = [1, 0, 0]`.
- An explicit frame with the same name overrides the default.
- The bounding box is measured after the geometry's transforms, so default
  anchors need no storage and cannot fall out of sync.

`x` (and so `y`) on a default anchor follows a fixed orientation rule so
default frames are consistent and predictable: on the four side faces
(`left`, `right`, `front`, `back`) `y` points up (world `+z`); on `top` and
`bottom` `y` points back (world `+y`). Edges and corners extend this
smoothly from the faces that meet there. This is BOSL2's cuboid spin-0
convention.

Bounding-box anchors match BOSL2 only for cuboids. BOSL2 resolves
`top+right` and similar on the curved surface of a cylinder or sphere;
bounding-box anchors put it on the corner of the box instead. Parts that need
the curved-surface placement declare the frame explicitly, or come from the
transpiler with BOSL2-resolved frames (see `fromBosl2` below).

## `attach`

```js
anchors.attach(child, childAnchor, parent, parentAnchor, { overlap = 0, flip = true, spin = 0 })
```

Returns `child`, transformed so its `childAnchor` frame sits on `parent`'s
`parentAnchor` frame. With `P` and `C` as the parent and child world frames
(as 4x4 matrices with columns `x, y, z, origin`):

```
M = P · T(0, 0, -overlap) · Ry(π if flip) · Rz(spin) · C⁻¹
```

- `flip` (default `true`): the child's `z` axis ends up opposed to the
  parent's, so two faces meet face to face. `flip: false` makes the `z` axes
  equal instead, useful when one part continues in the same direction as
  another (a shaft through a bearing, not two faces butting together).
- `overlap` (default `0`): moves the child `overlap` mm further into the
  parent, along the parent's `z`.
- `spin` (default `0`, radians): rotates the child about its own `z` axis
  before placement. On a geom2 side anchor, `z` lies in the XY plane, so a
  nonzero `spin` turns the shape out of plane and mirrors it.

`attach` bakes the child's anchored geometry in place before transforming it
(see "Baking" below).

## `alignTo`

```js
anchors.alignTo(child, parent, direction, { inset = 0, inside = false })
```

Translates `child` (without rotating it) so it sits against `parent`'s
bounding box in `direction`, a direction name or vector. Per axis:

- A zero component of `direction` centers `child` on `parent` along that
  axis.
- A positive component (default, `inside: false`) puts `child` just outside
  `parent`'s bounding box on that side, offset `inset` mm further out.
  `inside: true` instead puts `child` flush against the inside of that face,
  offset `inset` mm in from it.
- A negative component is the same, mirrored to the other side.

`alignTo` generalizes `transforms.align`, which only aligns to points.

## Anchor-preserving booleans

```js
anchors.unionAnchored(...geometries)
anchors.subtractAnchored(...args, { carry }?)
anchors.intersectAnchored(...geometries)
```

Arguments flatten arrays in argument order (`unionAnchored([a, [b]])` sees
`a` then `b`). Each input's frames are converted to world space (using that
input's own `transforms`) before merging, since the result has identity
transforms.

- `unionAnchored(a, ...rest)`: frames of `a`, plus any frame from `rest`
  whose name is not already present — earlier operands win on a name clash.
  Later operands can still add new names.
- `subtractAnchored(a, ...tools, { carry })`: frames of `a` only; tool
  frames are dropped unless carried. `carry: { prefix: tool }` adds that
  tool's **explicit** frames (not its defaults) to the result as
  `prefix.name`. This is how a hole becomes alignable: cut it with a
  cylinder that has an `axis` anchor, pass `carry: { bolt1: cylinder }`, and
  the plate keeps `bolt1.axis`.
- `intersectAnchored(a, ...rest)`: frames of `a` only.

`booleans.union`, `booleans.subtract`, and `booleans.intersect` imported from
`@jbroll/jscad-anchors` (not from raw `@jscad/modeling`) are these same
functions — `booleans.union === anchors.unionAnchored`, and likewise for
`subtract`/`intersect`.

## Wrapped modeling

Import modeling through this package, not directly from `@jscad/modeling`,
so frames survive every call:

```js
const { primitives, transforms, booleans, measurements } = require('@jbroll/jscad-anchors')
```

Every namespace and function `@jscad/modeling` exports is re-exported. Most
functions that don't take geometry (`maths`, `curves`, `primitives`, `text`,
`utils`, and a few geometry-description helpers) are untouched. Functions
that take anchored geometry fall into groups:

- **Pass through unchanged**: `translate`, `translateX/Y/Z`, `colorize`,
  `.clone`, and geom3's own `.transform`. Frames ride along automatically.
- **Read functions** (`measurements.*`, `toPoints`, `toString`,
  `toCompactBinary`, `isConvex`, `center`, `centerX/Y/Z`, `align`): the
  wrapper bakes anchored inputs before calling the raw function — the same
  work JSCAD would do internally regardless — so frames stay readable on the
  geometry afterward.
- **Matrix functions** (`rotate`, `rotateX/Y/Z`, `scale`, `scaleX/Y/Z`,
  `mirror`, `mirrorX/Y/Z`, `transform`, and `geometries.geom2.transform`):
  apply correctly to geom3 (which never bakes on these calls) and to geom2
  (which bakes through `reverse` whenever the matrix has negative
  determinant, such as a mirror or `rotateX(π)`) — frames stay correct and
  right-handed either way.
- **Structure-preserving functions** (`modifiers.generalize`,
  `modifiers.retessellate`, `geometries.geom3.invert`,
  `geometries.geom2.reverse`): the result keeps the same frames unchanged.
- **Frame-dropping functions**: `hull`, `hullChain`, every extrusion
  (`extrudeLinear`, `extrudeRotate`, `extrudeRectangular`, `extrudeHelical`,
  `extrudeFromSlices`, `project`), `expand`, `offset`,
  `minkowski.minkowskiSum`, `booleans.minkowski`, and `booleans.scission`
  produce geometry unrelated to the input's local space; their result never
  carries frames, even if the input was anchored.
- **Booleans**: `booleans.union/subtract/intersect` are `unionAnchored`,
  `subtractAnchored`, `intersectAnchored` (above).

`npm run exports:check` compares this grouping against the installed
`@jscad/modeling`'s actual exports and fails on anything new or changed that
isn't classified.

### Baking

Several of the above ("Read functions", `attach`, `alignTo`, `anchorArrows`,
and the anchored booleans) bake the geometry they are given: they convert its
frames to world space, run modeling's own in-place bake (which replaces
`polygons`/`sides` and resets `transforms` to identity), and store the
world-space frames back as the new local frames — in place, on the same
object the caller passed in. The geometry's *world* shape and position are
unchanged; only its internal representation is now `transforms: identity`
with frames already resolved. Later reads of that same object work exactly
as before.

### The raw-bake error

```
geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors
```

JSCAD v2 bakes geometry in place (replaces `polygons`/`sides`, resets
`transforms`) inside several raw functions: `measureBoundingBox` and the
other measurements, `toPolygons`/`toSides`, `retessellate`, and every
boolean's inputs. If that happens through *raw* `@jscad/modeling` on
anchored, transformed geometry (bypassing this package's wrapper), the
stored frames are left referring to the old, now-discarded polygon array.
The next read of that geometry's frames — `anchors()`, `anchor()`, or any
wrapped call — detects the mismatch and throws this error rather than
silently returning stale frames. There is no way to recover the frames after
this happens; the fix is to import modeling from `@jbroll/jscad-anchors`
everywhere a model touches anchored geometry.

### Non-uniform scale

`z` and `x` on a frame transform the same way as any direction under a
matrix: multiplied by the matrix's linear part, then renormalized to unit
length. This is a direct transform, not the inverse-transpose a true surface
normal needs under non-uniform scale or shear. So a face anchor's `z` on a
face that a non-uniform scale leaves non-perpendicular to its own surface is
*not* recomputed to stay a true normal — it is the old direction, scaled and
renormalized, which can point off the actual face.

Also note: on this fork, `transforms.scale` throws `factors must be
positive` for any factor `<= 0`. Negative scaling and mirroring go through
`transforms.transform(mat4.fromScaling(mat4.create(), factors), geometry)`
or `transforms.mirror`/`mirrorX/Y/Z`, both of which this package's wrapper
handles for geom2 as well as geom3.

## Debugging: `anchorArrows`

```js
anchors.anchorArrows(geometry, { length = 5 })
```

Returns an array of geom3 arrows, one per anchor — both the geometry's
explicit frames and its 27 defaults — each an arrow shape (shaft, head, and
a short cross-bar along `x`) placed on that frame, with a `.name` property
set to the anchor's name, for use in a viewer.

## BOSL2 and connector conversion

```js
anchors.fromBosl2([name, pos, orient, spin])   // -> [name, frame]
anchors.fromConnector({ point, axis, normal }) // -> frame
anchors.toConnector(frame)                     // -> { point, axis, normal }
```

- `fromBosl2` takes a BOSL2 anchor tuple: `name`, `pos` (2D or 3D), `orient`
  (a direction vector, not degrees), and `spin` **in degrees** (BOSL2's
  convention; every other angle in this package's API is radians). `z` is
  `unit(orient)`; `x` is the BOSL2 spin-0 reference for that orientation,
  rotated `spin` degrees about `z`. Extra tuple elements (such as BOSL2's
  `edge_angle` info) are ignored.
- `fromConnector`/`toConnector` map `@jscad/modeling`'s unexported connector
  shape (`{ point, axis, normal }`, as used by `connectors/create.js`) to and
  from a frame: `origin ⟷ point`, `z ⟷ axis`, `x ⟷ normal`. They round-trip.
