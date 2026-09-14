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
  `geom2/reverse` for a matrix with negative determinant, and `reverse` bakes
  the transforms and builds a new geometry. Upstream v2
  (`geom2/reverse.js:14-20`) drops every extra field, and v3 keeps only
  `color`. `fork-main` copies all fields (`2e81bb3a`), so `anchors` survives
  there with stale frames, which the `basis` check detects.
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

Decision: jscad-anchors wraps modeling, and modeling is not changed for
anchors. In-place baking is an intended cache in JSCAD v2 and v3, so anchors
work around it instead of asking modeling to change.

`@jbroll/jscad-anchors` re-exports every modeling namespace. Each function
that takes geometry falls in one group:

- Lazy pass-through: `translate`, `rotate`, `scale`, `center`, `transform`,
  geom3 `mirror`, `colorize`. Re-exported unchanged; `anchors` rides along
  and `transforms` keeps it correct.
- Input-baking: functions that call `applyTransforms` on their inputs, such as
  the `measurements`, `geom3.toPolygons`, `geom2.toSides`, and
  `retessellate`. The wrapper bakes each anchored input first, then calls the
  raw function. Modeling would bake that input anyway, so this adds no work.
- New geometry: booleans, hulls, extrusions, expansions, and geom2 `mirror`
  (which goes through `geom2/reverse`). The wrapper bakes anchored inputs,
  calls the raw function, and applies the rules in "Constructive operations"
  to the result. For geom2 `mirror` it mirrors each frame so it stays
  right-handed.

Baking an anchored input does what `applyTransforms` does, on the caller's
object: it transforms the frames by `geometry.transforms`, calls
`applyTransforms`, and sets `anchors` to a new value whose `basis` is the new
polygon or side array. Later calls on that object then neither bake again nor
desynchronize.

The grouping table is generated from modeling's exports. A test fails when a
modeling release adds or changes a geometry-taking export that the table does
not classify.

Raw modeling calls that bypass the wrapper cannot be repaired, because the
baked matrix is gone. Every read of frames compares `basisOf(geometry)` with
`anchors.basis`, and a mismatch throws: "geometry was baked outside
jscad-anchors; import modeling from @jbroll/jscad-anchors".

Rejected:

- A field hook or anchor-specific patch in modeling (`applyTransforms`,
  `geom2/reverse`). It would make raw calls safe, but since baking in place is
  intended upstream, it would remain fork divergence unless upstream accepts
  it (open question 6).
- Monkey patching modeling at load time. v2's CommonJS files capture each
  other's exports when required (`toPolygons.js` requires
  `./applyTransforms`), so replacing namespace functions misses the internal
  calls, and reaching them means rewriting `require.cache` before modeling
  loads, which depends on load order. v3 is ESM, whose exports cannot be
  reassigned. Bundled builds such as jscad-web's `bundle.jscad_modeling.js`
  have no require cache. It also changes modeling for everything in the
  process.
- An accessor on `transforms` or `polygons` that intercepts the bake.
  `transform` copies fields with `Object.assign`, which copies values and
  drops accessors, so the first lazy transform loses it.
- Recovering the baked matrix from corresponding vertices in `anchors.basis`
  and the new polygon array. It fails on flat or degenerate meshes.

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

The package also re-exports all of `@jscad/modeling` with the wrappers from
"Handling in-place baking", so a model imports both from one place:
`const { primitives, booleans, anchors } = require('@jbroll/jscad-anchors')`.

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
- Generated methods import modeling namespaces from `@jbroll/jscad-anchors`
  instead of `@jscad/modeling`, so every fluent call goes through the
  wrapper.

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
   Generated code and `openscad-runtime` import modeling from
   `@jbroll/jscad-anchors` rather than `@jscad/modeling`, so runtime helpers
   such as `_multmatrix` and the extrusions go through the wrapper.
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

- `jscad-work measure --anchors` lists world frames per part. `lib/` loads
  modeling through `@jbroll/jscad-anchors`, so its own `measure` and `check`
  calls do not bake anchored geometry behind the wrapper's back.
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
- `geom2/reverse` keeps only `color`, so `anchors` is dropped by a raw geom2
  mirror on v3; the wrapper's mirror handling covers it either way.
- The wrapper's grouping table is regenerated from v3's flat exports.
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

The OpenJSCAD.org fork is kept as close to upstream as possible, and anchors
need no change to it:

- https://github.com/jbroll/jscad-anchors, a repository beside jscad-fluent,
  holds all anchor code, published as `@jbroll/jscad-anchors` with its own
  tests. Native models, jscad-fluent, the transpiler, and jscad-ai-studio
  import modeling through it.
- `packages/modeling` on `fork-main` in https://github.com/jbroll/OpenJSCAD.org
  carries one related fix, `2e81bb3a`: `geom2/reverse` keeps the geometry's
  fields. It is a JSCAD bug (mirroring a colored geom2 lost its color) to
  submit upstream, and anchors do not depend on it.

Anchors version and release independently of modeling, and rebasing the fork
onto upstream master or v3 carries no anchor code. The cost is a fifth
sibling checkout and keeping the wrapper's grouping table in step with the
modeling releases it wraps.

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

- Unit tests per function in this repository, run against the sibling
  modeling checkout.
- Wrapper coverage: for each group (lazy pass-through, input-baking, new
  geometry), frames on an anchored, transformed input stay correct through
  the wrapped call; and the grouping table covers every geometry-taking
  modeling export.
- Raw bake detection: calling raw `@jscad/modeling` `measureBoundingBox` or a
  raw boolean on an anchored, transformed geometry, then reading its frames,
  throws the "baked outside jscad-anchors" error.
- geom2 `mirror` keeps frames, right-handed, through the wrapper.
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
6. Offer a field hook upstream to JSCAD (v2 master, v3, or both)? A field
   value would define a method under `Symbol.for('jscad.transformField')`,
   `(matrix, newGeometry) => newValue`, which `applyTransforms` and
   `geom2/reverse` call before resetting `transforms`. It is about ten lines
   and knows nothing about anchors. If accepted, raw modeling calls on
   anchored geometry become safe and the wrapper's input-baking step can be
   dropped. Submit the `geom2/reverse` field fix (`2e81bb3a`) separately as a
   bug report.
