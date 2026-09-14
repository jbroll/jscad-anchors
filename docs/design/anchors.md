# Anchors: named frames on JSCAD geometry

Status: draft spec, 2026-09-14. Working document; fold decisions into permanent
docs and delete before merge.

## Problem

Parts are placed with hand-computed `translate`/`rotate` numbers. Two holes
line up only if two pieces of code repeat the same arithmetic, and nothing
records that they were meant to. jscad-ai-studio currently detects alignment
after the fact from meshes, which cannot find holes inside a part.

Three producers of geometry should share one placement model:

1. native JS models written against `@jscad/modeling`,
2. jscad-fluent models (`/home/john/src/jscad-fluent`),
3. OpenSCAD models transpiled by jscadui's `packages/openscad`, including
   BOSL2 attachables.

## Goals

- A part carries named frames (anchors) that move with it.
- `attach` places one part so that its frame meets another part's frame.
  Alignment is a result of construction, not of detection.
- Frames survive transforms and follow explicit rules through booleans.
- Default anchors on every part from its bounding box, named like BOSL2.
- The data model can represent every BOSL2 anchor, so a later transpiler
  change can export BOSL2 anchors to JS without a new model.

## Non-goals

- Selecting faces or edges of a mesh. JSCAD meshes have no stable faces after
  booleans.
- A constraint solver, relational constraints (parallel, distance, angle), or
  assemblies with loops.
- Joint types and motion (revolute, slider). A frame can later carry a joint
  type and range without changing the model.
- Frames through `hull`, extrusions, `expand`, and `offset` in the first
  version (see "Other operations").

## Prior art

| System | Anchor as data | Moves with part | Through booleans |
|---|---|---|---|
| [BOSL2](https://github.com/BelfrySCAD/BOSL2/wiki/Tutorial-Attachments) | `[name, pos, orient, spin]` (`named_anchor`, attachments.scad:2646), direction-vector anchors resolved against an `attach_geom` description | only during the call, via `$parent_*` | not applicable; anchors describe declared geometry |
| JSCAD v1 connectors | `{point, axis, normal}` in `csg.properties` | yes, `properties._transform` | merged, existing key wins |
| [build123d joints](https://build123d.readthedocs.io/en/latest/joints.html) | `Location` relative to parent part | yes | dropped |
| [PythonSCAD handles](https://www.pythonscad.org/reference/align/) | 4x4 matrix attributes | yes | kept, per docs |
| [Onshape mate connectors](https://cad.onshape.com/help/Content/Assembly/mates.htm), FreeCAD Assembly4 LCS, STEP `AXIS2_PLACEMENT_3D`, URDF/SDF frames | origin, Z axis, X reference, name | yes | not applicable |

Every system that works without face selection stores a named rigid frame,
and the mature ones converge on origin plus Z plus an X reference. BOSL2 is
the only widely used anchor system in OpenSCAD, but most of its machinery
(`$parent_*`, `attachable(){geom; children();}`, multi-pass `diff()`) exists
because OpenSCAD geometry cannot be queried after it is built. Its essential
ideas are frames, direction-vector anchors on a simple shape description,
child-to-parent attach with overlap and spin, `align` to faces, edges, and
corners, named parts, and an anchor debug view. This spec keeps those and
drops the call-time machinery.

## Data model

```js
// frame: a right-handed orthonormal basis at a point, in part-local mm
{ origin: [x, y, z], z: [zx, zy, zz], x: [xx, xy, xz] }
```

- `z` is the meaning of the anchor: face normal, hole axis, slide direction.
  For a face anchor it points out of the part.
- `x` fixes rotation about `z`. On creation `x` is made orthogonal:
  `x = normalize(x - dot(x, z) * z)`. If `x` is parallel to `z`, `x` is
  replaced by a fixed reference (see open question 1).
- `y = cross(z, x)`, not stored.
- Frames are immutable values. Every operation returns new frames.
- A frame is equivalent to a mat4 `F` with columns `x, y, z, origin`.

Anchor names are strings. Named anchors use the caller's name. Direction
anchors use a canonical name built from BOSL2 direction words in fixed order,
joined by `+`: `top`, `bottom`, `left`, `right`, `front`, `back`, and
combinations like `top+right` or `top+front+left`. `center` is the origin.
Lookups also accept a direction vector (`[0, 0, 1]`) and canonicalize it.

Conversions, all in the package:

- `fromBosl2([name, pos, orient, spin])`: `z = unit(orient)`; `x` is BOSL2's
  spin-0 reference for that `orient`, rotated by `spin` degrees about `z`.
  BOSL2 angles are degrees; all JS API angles are radians. Only the BOSL2
  converters take degrees.
- `fromConnector({point, axis, normal})`: `origin = point`, `z = axis`,
  `x = normal`. This matches `connectors/create.js` in `@jscad/modeling`,
  where `normal` is the "12 o'clock" reference.
- `toConnector(frame)` for code that uses the unexported connector module.

## Storage on geometry

Frames are stored on the geometry object in the same coordinate space as its
polygons (geom3) or sides (geom2):

```js
geometry.anchors = { frames: { [name]: frame }, basis: basisOf(geometry) }
```

`basisOf` returns `polygons` for geom3 and `sides` for geom2 on v2
(`outlines` on v3). All anchors code reads the basis through it, never through
the field names.

The world frame of an anchor is `geometry.transforms · F`.

### Verified behavior this relies on

jscadui, jscad-fluent, and jscad-ai-studio are consolidating on one modeling
package: `packages/modeling` on the `fork-main` branch of
https://github.com/jbroll/OpenJSCAD.org, which is upstream master plus the
fork's performance work, published as `@jbroll/jscad-modeling`. Consumers link
it from a sibling checkout (`../OpenJSCAD.org/packages/modeling`) with npm
overrides so transitive `@jscad/*` packages use the same copy. The files below
were checked in modeling 2.12.7 and 2.13.0 and are identical in both; recheck
them on `fork-main`.

- Transforms are lazy and copy other fields.
  `src/geometries/geom3/transform.js:15-18` composes `transforms` and returns
  `Object.assign({}, geometry, { transforms })`. So an `anchors` field is
  carried by every `translate`, `rotate`, `scale`, `center`, geom3 `mirror`,
  and the transpiler's `_multmatrix` (jscadui `packages/openscad-runtime/src/transforms.js:131-145`),
  and `transforms` keeps it correct.
- geom2 mirroring is the exception. `geom2/transform.js:17-25` calls
  `geom2/reverse` for a matrix with negative determinant, and `reverse`
  (`geom2/reverse.js:14-20`) bakes the transforms and builds a new geometry,
  dropping every extra field. v3 keeps only `color` there.
- `colorize` uses `geom3.clone`/`geom2.clone`, which are
  `Object.assign({}, geometry)` (`geom3/clone.js:7`), so `anchors` survives.
- Baking transforms mutates in place. `geom3/applyTransforms.js:13-21`
  replaces `geometry.polygons` with transformed polygons and resets
  `geometry.transforms` to identity on the same object. `geom2/applyTransforms.js:13-24`
  does the same for sides. `applyTransforms` runs inside `geom3.toPolygons`
  (`toPolygons.js:13`), which is called on the inputs of every boolean
  (`booleans/unionGeom3Sub.js:17-18`), by `retessellate`
  (`modifiers/retessellate.js:19`), and by `measureBoundingBox`
  (`measurements/measureBoundingBox.js:86`).

The last point breaks naive local storage. After
`const a = translate([10, 0, 0], part); measureBoundingBox(a)`, `a.transforms`
is identity while `a.anchors.frames` are still in the untransformed space, so
`a`'s anchors read 10 mm off. jscad-fluent hits this on every boolean:
`FluentGeom3.union` passes `this` to `booleans.union`
(`src/gen/FluentGeom3.ts:124-131`), which bakes `this` in place.

### Handling in-place baking

The `basis` field records which polygon array the frames belong to.
`applyTransforms` always installs a new array, so
`geometry.polygons !== anchors.basis` means the transforms were baked.

Decision: a generic field hook in `packages/modeling`, with no anchor logic.

- A field value on a geometry may define a method under the well-known symbol
  `Symbol.for('jscad.transformField')`, with signature
  `(matrix, newGeometry) => newValue`.
- `geom3/applyTransforms` and `geom2/applyTransforms`, before resetting
  `transforms`, replace each such field with the method's result for the
  matrix being baked.
- `geom2/reverse` copies every extra field onto the geometry it builds, as v3
  already does for `color`, and applies the same method with the baked matrix.
- Fields without the method are left alone in `applyTransforms` and copied
  unchanged by `reverse`.

The hook is about ten lines, knows nothing about anchors, and can be offered
upstream to JSCAD as "keep user fields through baking and mirroring." A
symbol from `Symbol.for` is shared across module copies and needs no registry
or global state. The anchors package gives `geometry.anchors` that method, so
frames and `basis` stay correct for every consumer, including raw
`@jscad/modeling` calls. The `basis` check stays as an assertion that throws
if frames are read from a modeling build without the hook. The method mirrors
frames when the matrix has a negative determinant so they stay right-handed.

Rejected:

- Anchor-specific patches to `applyTransforms` and `reverse`. They put anchor
  code in modeling and grow the fork's diff from upstream.
- Recovering the baked matrix outside modeling by solving it from
  corresponding vertices in `anchors.basis` and the new polygon array. It
  needs no modeling change but fails on flat or degenerate meshes and cannot
  see fields dropped by `reverse`.

## Constructive operations

Raw `@jscad/modeling` booleans, hulls, extrusions and expansions return
`geom3.create(...)` results (`booleans/intersectGeom3Sub.js:30`,
`hulls/hullGeom3.js:24`, `extrusions/extrudeFromSlices.js:121`), so they drop
`anchors`. The package exports wrappers that apply these rules:

- `unionAnchored(a, ...rest)`: frames of `a`, plus frames of `rest` whose
  names are not already present, earlier operands winning. This is the JSCAD
  v1 rule.
- `subtractAnchored(a, ...tools, { carry })`: frames of `a`. With
  `carry: { [prefix]: tool }`, frames of that tool are added as
  `prefix.name`. Cutting a hole with a cylinder that has an `axis` anchor and
  `carry: { bolt1: cyl }` leaves `bolt1.axis` on the plate. This is how holes
  become alignable by construction.
- `intersectAnchored(a, ...rest)`: frames of `a`.
- Frames are converted to world space of each input (`transforms · F`)
  before merging, since the result has identity transforms.
- Arrays: frames stay per item; there is no implicit merge.

Other operations (hull, extrusions, expand, offset) drop frames in the first
version. Extrusions could later lift 2D frames into 3D; that needs a rule for
which cap a frame goes to (open question 2).

## Default anchors

Every geom3 and geom2 has direction anchors computed on demand from its
bounding box, so plain parts work without declarations:

- `origin = center + d ⊙ halfExtent` for direction `d` with components in
  {-1, 0, 1}. `z = normalize(d)`.
- `center` has `z = [0, 0, 1]`.
- Explicit frames with the same name override defaults.
- The bounding box is computed from the geometry after its transforms, so
  default anchors need no storage and cannot desynchronize.

Bounding-box anchors match BOSL2 for cuboids only. For cylinders and spheres,
BOSL2 resolves `top+right` on the curved surface. Parts that want that declare
the frames, or come from the transpiler with BOSL2-resolved frames.

## API

Package `@jbroll/jscad-anchors` in its own repository,
https://github.com/jbroll/jscad-anchors, checked out as a sibling at
`../jscad-anchors`, with `@jscad/modeling` as a peer dependency. Modeling does
not depend on it. The functions are pure, use only modeling's public `maths`, `geometries`,
`booleans`, and `measurements` exports, and ship with `.d.ts` files, so the
later move to v3's ESM package is mechanical. Names avoid v3's flat exports
(`union`, `subtract`, `intersect`, `align` already exist there), so a later
re-export from modeling stays possible.

```js
frame(origin, z, x)                          // orthogonalized frame
withAnchors(geometry, { name: frame, ... })  // new geometry, frames in its local space
anchors(geometry)                            // { name: worldFrame }, explicit only
anchor(geometry, nameOrVector)               // worldFrame, explicit then default; throws if unknown
attach(child, childAnchor, parent, parentAnchor, { overlap = 0, flip = true, spin = 0 })
alignTo(child, parent, direction, { inset = 0, inside = false })
unionAnchored(...), subtractAnchored(...), intersectAnchored(...)
anchorArrows(geometry, { length = 5 })       // geom3 arrows for debugging, one per anchor
fromBosl2(anchorData), fromConnector(c), toConnector(f)
```

`attach` returns `child` transformed so that the child frame, rotated
`spin` radians about its `z`, sits on the parent frame with `z` axes opposed
(`flip: true`, parts meet face to face) or equal (`flip: false`), moved
`overlap` mm into the parent along the parent's `z`. The matrix is

```
M = P · T(0, 0, -overlap) · Rx(π if flip) · Rz(spin) · C⁻¹
```

where `P` and `C` are the parent and child world frames as mat4. With full
orthonormal frames this is closed form. `connectors/transformationBetween.js`
in `@jscad/modeling` is not reused: it builds intermediate bases with
`plane.fromPointsRandom` and carries a "TODO: understand and explain this"
at line 42.

`alignTo` places `child` against `parent`'s bounding box in `direction`
without rotating it: flush to a face, edge, or corner, outside by default or
inside with `inside: true`, offset by `inset`. It generalizes
`transforms.align` (`operations/transforms/align.js`), which aligns only to
points.

Named parts (BOSL2 `define_part`) are expressed as arrays of anchored
geometry or as prefixed frames; no separate part type in the first version.

## jscad-fluent

The fluent constructor copies all fields (`Object.assign(this, geometry)`,
`src/gen/FluentGeom3.ts:33-35`) and every transform method wraps the raw
result (`_wrap`, lines 38-40). So `anchors` rides along with no change.
Additions, generated like the other methods:

- `.withAnchors(frames)`, `.anchor(name)`, `.anchors()`
- `.attachTo(parent, parentAnchor, childAnchor, options)`
- `.alignTo(parent, direction, options)`
- `.union/.subtract/.intersect` call `unionAnchored`, `subtractAnchored`,
  and `intersectAnchored` instead of raw `booleans` (lines 124-131), and
  `.subtract` accepts `{ carry }`.
- geom2 and path2 classes get the same, where meaningful.

jscad-fluent gains a dependency on `@jbroll/jscad-anchors`, declared the same
way as modeling: a peer range for publishing and a `file:` link to the sibling
checkout (`../jscad-anchors`) for local installs.

## Transpiler

Paths in this section are relative to jscadui. Generated code calls raw
`@jscad/modeling`
(`packages/openscad/src/transpiler/helpers/imports.ts:20-73`). BOSL2
attachables are transpiled from BOSL2 source like any module:
`attachable()` (`.deps-cache/bosl2-lib/attachments.scad:2404-2450`) builds
`geom` with `attach_geom` (line 2821), places the shape with
`multmatrix(_attach_transform(...))`, and sets `$parent_*` special variables,
which the transpiler tracks (`src/transpiler/specialVars.ts:19-24`).

A later transpiler change can export BOSL2 anchors:

1. Special-case `attachable` in module dispatch
   (`src/transpiler/statements.ts:521-564`, where `for`, `color`, `hull` and
   `children` are routed) to wrap the shape child's result with
   `withAnchors`, importing `@jbroll/jscad-anchors` in the generated code
   (`helpers/imports.ts`) and adding it to `openscad-runtime`'s dependencies.
2. Resolve frames by calling the transpiled `_find_anchor(anchor, geom)`
   (attachments.scad:3313), which returns `[anchor, pos, vec, spin]`, for each
   named anchor in `last(geom)` and each of the 26 direction vectors, and
   convert with `fromBosl2`.
3. Store frames before the `multmatrix(m)` is applied. The lazy transform
   carries them.
4. Emit the anchor-preserving booleans so a BOSL2 `diff()` result keeps the
   parent's frames.

Resolving 27 anchors per attachable at runtime may cost too much in large
BOSL2 models; frames could instead store the `geom` description and resolve
on first lookup (open question 3).

## jscad-ai-studio

- `jscad-work measure --anchors` lists world frames per part.
- `verify-spec` gains anchor assertions, for example
  `{ "a": "0:bolt1.axis", "b": "1:axis", "coincident": { "tolerance": 0.01, "angle": 0.1 } }`,
  checking origin distance and axis angle from frames, with no mesh
  analysis.
- This replaces the "Hole alignment across parts" item in its backlog.
- `skills/jscad-assembly` teaches `attach` and `subtractAnchored` with `carry`.

## JSCAD v3

Checked against `@jscad/modeling` 3.0.7-alpha.0 (upstream `V3`, 2026-08-02).
v3 has been alpha since 2023, has one active maintainer, and states no release
plan, so anchors are built on v2 `fork-main` and written to port.

What the design relies on is unchanged in v3: lazy transforms that copy extra
fields (`geom3/transform.js:16-19`), `clone` copying all fields, in-place
baking in `applyTransforms` (`geom3/applyTransforms.js:13-21`) from the same
callers, and constructive operations returning new geometry. `connectors/` is
still unexported, and no anchor or metadata feature was added.

What changes on the move:

- geom2 stores `outlines` instead of `sides`; only `basisOf` changes.
- `geom2/reverse` keeps only `color`; the hook widens that to every extra
  field, so the hook's diff is smaller on v3.
- ESM only, flat exports with v2 namespaces kept for compatibility; the
  anchors names above do not collide.
- `measureBoundingBox` caches per object in a WeakMap
  (`measureBoundingBox.js:13,49-60`); default anchors must not read a stale
  box after an in-place bake.
- Consumers: about 8 call sites across jscad-fluent (`minkowski` namespace,
  `expansions` deep type import), the OpenSCAD runtime (`slice.fromSides`,
  `booleans.minkowski`), and jscad-ai-studio (`lib/check.js` reads `sides`),
  plus the four serializers at `3.0.7-alpha.0`.

## Where the package lives

Anchors are additive except for the field hook, and the OpenJSCAD.org fork is
kept as close to upstream as possible. The layout follows that split:

- `packages/modeling` on `fork-main` in https://github.com/jbroll/OpenJSCAD.org:
  the generic field hook only (see "Handling in-place baking"). Nothing else
  in the fork changes.
- https://github.com/jbroll/jscad-anchors, a repository beside jscad-fluent:
  everything else, published as `@jbroll/jscad-anchors`, with its own tests.
  Native models, jscad-fluent, and the transpiler depend on it.

Rebasing the fork onto upstream master or v3 carries only the hook, and
anchors version and release independently of modeling. If upstream JSCAD
accepts the hook, anchors run on stock `@jscad/modeling` with no fork at all
(open question 6). The cost is a fifth sibling checkout and keeping the
anchors peer range in step with the modeling versions that have the hook.

Rejected:

- `packages/anchors` in the OpenJSCAD.org fork. Adds a package to the fork
  beyond the hook.
- Anchors inside `packages/modeling`. Every anchor change becomes fork
  divergence.
- `packages/anchors` in jscadui. jscad-fluent would depend on jscadui, whose
  packages are not published.
- A subpath export of jscad-fluent. Transpiled output would depend on
  jscad-fluent.

## Testing

- Modeling: ava tests for the field hook alone, with a dummy field, in
  geom3 and geom2 `applyTransforms` and `geom2/reverse`, plus a check that
  geometry without extra fields is unchanged and the suite still passes.
- Anchors: unit tests per function in this repository, run against the
  sibling modeling checkout.
- geom2 `mirror` keeps frames, right-handed, through the hook in `reverse`.
- Default anchors after an in-place bake match a freshly measured box, which
  guards v3's per-object bounding-box cache.
- Frames through transform chains: random `translate`/`rotate`/`scale`/`mirror`
  sequences, with a bake (`measureBoundingBox`, `toPolygons`) inserted at
  random points, compared against transforming the frames directly. Covers
  the desynchronization case above for geom3 and geom2, including geom2
  mirroring, which reverses sides.
- Boolean rules: name clashes, `carry` prefixes, transformed inputs.
- `attach`: child frame coincides with parent frame after placement for
  `flip`, `spin`, and `overlap`; round trip through `toConnector`.
- BOSL2 conversion: for cuboid, cylinder, and sphere attachables, compare
  `fromBosl2` frames against BOSL2's `_find_anchor` results evaluated through
  the transpiler, so no OpenSCAD binary is needed.
- `anchorArrows` renders in the viewer (one screenshot test).

## Open questions

1. The fixed `x` reference when `x` is missing or parallel to `z`. It should
   match BOSL2's spin-0 reference for the same direction so converted and
   native frames agree; the exact BOSL2 rule (from `_attach_transform`,
   attachments.scad:3200) is not yet confirmed.
2. Should extrusions lift 2D frames to the bottom cap, both caps, or neither?
3. Transpiler: resolve all BOSL2 anchors eagerly per attachable, or store the
   `geom` description and resolve lazily?
4. Should `union` merge frames from later operands at all, or keep only the
   first operand's like `subtract` and `intersect`?
5. Do serializers and `format-jscad` ignore the extra `anchors` field? Not
   checked.
6. Offer the field hook upstream to JSCAD (v2 master, v3, or both)? If
   accepted, anchors run on stock `@jscad/modeling` and the fork carries no
   anchor-related change.
