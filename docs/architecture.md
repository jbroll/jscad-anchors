# Architecture

## Module map

| Module | Responsibility | Depends on |
|---|---|---|
| `src/frame.js` | Frame construction and algebra: orthogonalization, the BOSL2 spin-0 reference, `frame`↔`mat4` conversion, `transformFrame` | raw `@jscad/modeling` `maths` only |
| `src/names.js` | Canonical direction names, BOSL2 aliases, name↔vector | nothing |
| `src/convert.js` | `fromBosl2`, `fromConnector`, `toConnector` | `frame.js`, raw `maths` |
| `src/storage.js` | `basisOf`, `localFrames`/`worldFrames`, `withAnchors`, `withWorldFrames`, `bake`/`bakeAll`, the baked-outside check | raw `geometries`/`maths`, `frame.js`, `names.js` |
| `src/defaults.js` | Bounding-box default anchors and their orientation rule | raw `maths`/`measurements`, `frame.js`, `names.js`, `storage.js` |
| `src/lookup.js` | `anchors()`/`anchor()`: explicit-then-default resolution | `names.js`, `storage.js`, `defaults.js` |
| `src/booleans.js` | `unionAnchored`, `subtractAnchored`, `intersectAnchored` | raw `booleans`/`geometries`/`utils`, `storage.js` |
| `src/wrap/groups.js` | The classification table (`GROUPS`, `PREFIXES`, `TABLE`, `classify`) | nothing |
| `src/wrap/listFunctions.js` | Walks a modeling-shaped object tree, listing every function with its path and arity | nothing |
| `src/wrap/index.js` | Builds the wrapped modeling tree: walks raw `@jscad/modeling`, applies the `WRAPPERS` for each function's `classify()` group | raw `@jscad/modeling`, `groups.js`, `storage.js`, `frame.js`, `booleans.js` |
| `src/place.js` | `attach`, `alignTo` | wrapped modeling (`src/wrap`), `frame.js`, `lookup.js`, `names.js` |
| `src/debug.js` | `anchorArrows` | raw `primitives`/`booleans`/`transforms` for the arrow shapes; `storage.js`/`defaults.js` to read the source geometry's frames |
| `src/index.js` | Public entry point: assembles the `anchors` function-with-properties and re-exports the wrapped modeling namespaces | wrapped modeling, `frame.js`, `storage.js`, `lookup.js`, `booleans.js`, `place.js`, `debug.js`, `convert.js` |

Dependency direction: `frame`, `names`, `convert`, `storage`, `defaults`,
`lookup`, and `booleans` import raw `@jscad/modeling` and manage baking
themselves (`storage.bake`/`bakeAll`), so they need no wrapper. `place` and
`index` import the wrapped modeling from `src/wrap` for calls that operate on
the *caller's* anchored geometry (`transform`, `translate`, measurements), so
those stay bake-safe automatically rather than calling `bake` by hand.
`debug` is the exception: it builds arrow shapes from raw
`primitives`/`booleans`/`transforms`, since an arrow is always fresh,
unanchored geometry with no frames of its own to protect; it reads the
*source* geometry's frames through `storage`/`defaults`, which already bake
as needed.

## Scope

- No selecting faces or edges of a mesh. JSCAD meshes have no stable faces
  after booleans.
- No constraint solver, and no relational constraints (parallel, distance,
  angle) or assemblies with loops.
- No joint types or motion (revolute, slider). A frame can later carry a
  joint type and range without changing the model.

Frames through `hull`, extrusions, `expand`, and `offset` are also out of
scope for now, but unlike the items above have a path forward; see
`docs/backlog.md`.

Named parts (BOSL2 `define_part`) are expressed as arrays of anchored
geometry or as prefixed frames (`bolt1.axis`). There is no separate part
type in the first version.

## Prior art

| System | Anchor | Moves with part | Through booleans |
|---|---|---|---|
| BOSL2 | `[name, pos, orient, spin]`, direction anchors on an `attach_geom` description | only during the call, via `$parent_*` | not applicable |
| JSCAD v1 connectors | `{ point, axis, normal }` | yes | merged, existing key wins |
| build123d joints | `Location` relative to the part | yes | dropped |
| Onshape mate connectors, FreeCAD LCS, STEP `AXIS2_PLACEMENT_3D`, URDF | origin, Z axis, X reference, name | yes | not applicable |

Every system that works without face selection stores a named rigid frame,
and the mature ones converge on origin plus Z plus an X reference. BOSL2's
`$parent_*` variables, `attachable()`, and multi-pass `diff()` exist because
OpenSCAD geometry cannot be queried after it is built. This package keeps
BOSL2's frames, direction anchors, attach with overlap and spin, align,
named parts, and a debug view, and drops the call-time machinery.

## Storage and the basis check

Frames are stored on the geometry object, in the same coordinate space as
its `polygons` (geom3) or `sides` (geom2):

```js
geometry.anchors = { frames: { [name]: frame }, basis: basisOf(geometry) }
```

`basisOf` returns `polygons` for geom3 and `sides` for geom2. All anchors
code reads through it, never through the field names directly, so the geom2
v3 rename to `outlines` is a one-line change (see "JSCAD v3" below).

`@jscad/modeling` bakes several kinds of geometry in place: `applyTransforms`
replaces `polygons`/`sides` with transformed values and resets `transforms`
to identity, on the same object, inside `toPolygons`/`toSides`,
`retessellate`, every boolean's inputs, and every `measurements` call. This
breaks naive local storage:

```js
const a = translate([10, 0, 0], part)
measureBoundingBox(a)
// a.transforms is now identity, but a.anchors.frames are still in the
// untransformed local space, so a's anchors read 10 mm off.
```

`anchors.basis` records which polygon/side array the frames belong to.
Baking always installs a new array, so `basisOf(geometry) !== anchors.basis`
means a bake happened; `localFrames`/`worldFrames` check this on every read
and throw the baked-outside-jscad-anchors error (below) rather than return
stale frames.

## The wrapper decision

Modeling is not changed for anchors; in-place baking is an intended cache in
JSCAD v2 (and v3), so anchors work around it. `@jbroll/jscad-anchors`
re-exports every modeling namespace, walking the raw `@jscad/modeling`
object and wrapping each geometry-taking function according to its group
(below): baking anchored inputs first where modeling would bake them
anyway, and, for new geometry, applying the rules in "Constructive
operations" (`docs/user-manual.md`).

Four alternatives were rejected:

- **A field hook or anchor-specific patch in modeling** (`applyTransforms`,
  `geom2/reverse`). Would make raw calls safe, but stays fork divergence
  unless upstream accepts it (open question below).
- **Monkey patching modeling at load time.** v2's CommonJS files capture
  each other's exports when required (`toPolygons.js` requires
  `./applyTransforms`), so replacing namespace functions misses the internal
  calls; reaching them means rewriting `require.cache` before modeling
  loads, which depends on load order. v3 is ESM, whose exports cannot be
  reassigned. Bundled builds have no require cache. It would also change
  modeling for everything in the process, not just anchors.
- **An accessor on `transforms` or `polygons`** that intercepts the bake.
  `transform` copies fields with `Object.assign`, which copies values and
  drops accessors, so the first lazy transform loses it.
- **Recovering the baked matrix** from corresponding vertices in
  `anchors.basis` and the new polygon array. Fails on flat or degenerate
  meshes.

## The group table

`src/wrap/groups.js` classifies every path modeling exports (`booleans.union`,
`transforms.rotateX`, ...) into one of `GROUPS`: `none`, `lazy`, `bake`,
`matrix`, `keep`, `drop`, `union`, `subtract`, `intersect`. Most entries are
exact paths in `TABLE`, carrying the group, the raw function's arity, and (for
`matrix`/`keep`) how many leading arguments come before the geometry
operands (`lead`). A handful of whole namespaces that never take anchored
geometry (`maths`, `curves`, `primitives`, `text`, `utils`,
`geometries.path2`/`poly2`/`poly3`, `extrusions.slice`) are classified in
bulk through `PREFIXES` instead of one `TABLE` entry per function.
`src/wrap/index.js` walks the raw `@jscad/modeling` tree
(`src/wrap/listFunctions.js` does the same walk for the tests and
`scripts/list-exports.js`) and applies the matching `WRAPPERS[group]` to each
function.

Two checks keep the table in step with the installed modeling version:

- `test/groups.test.js` fails if modeling exports a geometry-taking function
  `classify()` doesn't recognize, if a `TABLE` entry's recorded arity no
  longer matches the live function's `.length`, or if a `PREFIXES` entry
  matches nothing.
- `npm run exports:check` (`scripts/list-exports.js`) prints the same
  information for a human: unclassified exports, arity drift, and `TABLE`
  entries for exports that no longer exist, exiting non-zero if there's
  anything to fix.

**geom2's 2D-determinant reverse case.** `geometries.geom2.transform` calls
`geom2/reverse` whenever the transform matrix's upper-left 2x2 block has a
negative determinant (`m[0]*m[5] - m[4]*m[1] < 0`), which bakes the geometry
and reverses its point order. A mirror is the obvious case, but so is
`rotateX(π)`: because geom2 lives in the XY plane and JSCAD tracks 2D
winding through that same 2x2 block, a 180° rotation about X flips Y's sign
in that block the same way a mirror would, even though the rotation is a
proper (determinant +1) 3D transform. This is why `rotate*` and `scale*`
sit in the `matrix` group alongside `mirror*` and `transform`, rather than
`lazy`: any of them can trigger `reverse` for a geom2 input, and the wrapper
needs to re-attach frames (transformed, and re-orthogonalized so they stay
right-handed) to whatever `reverse` produces.

**The `withWorldFrames` assumption.** In the `keep` and `matrix` groups,
`carry` (`src/wrap/index.js`) leaves its result alone when the result is
already `inSync` — its `anchors.basis` still matches its own basis, which is
the common case for a lazy transform result that merely composed a new
`transforms` matrix onto the same polygons/sides. Otherwise `carry` computes
the input's world frames (or, for `matrix`, those frames transformed by the
matrix) and stores them on the result through `withWorldFrames`, which sets
them as the result's *local* frames against its *current* basis, without
touching `transforms`. That's correct only because every out-of-sync result
coming out of modeling has identity `transforms` at that point: fresh
geometry from `geom2.create`/`geom3.create`, the baked output of
`geom2.reverse` (which bakes a copy, so the `matrix` group never bakes its
input), `generalize`, and `retessellate`, and, in the `keep` group, clones of
inputs that `bakeAll` already baked to identity earlier in the same call. A future
modeling function that returned a new basis with a non-identity `transforms`
already pending would have its frames stored in the wrong space, silently,
since nothing checks `transforms` at that point.

## BOSL2 reference rules

Two BOSL2 conventions are implemented, resolving spec open question 1 (what
fixed `x` reference to use when `x` is missing or parallel to `z`):

- **Spin-0 reference** (`frame.js`'s `spinReference`/`rotationFromUp`):
  matches BOSL2's `affine3d_rot_from_to(UP, z)` — the rotation that takes
  `[0, 0, 1]` to `z`, applied to `[1, 0, 0]` — with BOSL2's `vector_axis`
  special case for `z` = DOWN, where the rotation axis is ambiguous and
  BOSL2 picks BACK (`[0, 1, 0]`).
- **Cuboid spin hints** (`defaults.js`'s `yHint`): matches BOSL2's
  `_compute_spin` convention for a cuboid's default anchors — `y` points up
  on the four side faces, back on top and bottom, extended smoothly to edges
  and corners from the faces that meet there.

Both are tested against values hand-derived from the BOSL2 source
(`affine3d_rot_from_to`, `vector_axis`, `_compute_spin`), not against
transpiled BOSL2 output; the transpiler cross-check is a backlog item
(`docs/backlog.md`).

## Boolean rules

`unionAnchored`'s union keeps `a`'s frames and adds any frame from the
remaining operands whose name isn't already present, earlier operands
winning on a clash. This resolves spec open question 4 (whether union should
merge frames from later operands at all) by keeping JSCAD v1 connectors'
rule: on a name clash, the existing key wins. `subtractAnchored` and
`intersectAnchored` keep only the first operand's frames, plus whatever
`subtractAnchored`'s `carry` option explicitly adds — no clash rule is
needed there since nothing but the carried, prefixed names can collide.

## API names

Names avoid v3's flat exports `union`, `subtract`, `intersect`, and `align`,
so modeling can re-export this package's functions later without a clash.
That is why the API uses `unionAnchored`, `subtractAnchored`,
`intersectAnchored`, and `alignTo`.

## `attach` math

`attach` computes `M = P · T(0, 0, -overlap) · Ry(π if flip) · Rz(spin) ·
C⁻¹`, where `P` and `C` are the parent and child anchors' world frames as
4x4 matrices (columns `x, y, z, origin`), and applies `M` to the child with
`transforms.transform`. With full orthonormal frames this is closed form.

The flip is `Ry(π)` because BOSL2's `_attach_transform` uses `yrot(180)`,
which keeps `y` and so makes face contact between default anchors a pure
translation. This supersedes the original spec's `Rx(π)`, which turned 3D
children 180° about `z` and mirrored geom2 children.

`@jscad/modeling`'s `connectors/transformationBetween.js` is not reused: it
builds intermediate bases with `plane.fromPointsRandom` and carries a "TODO:
understand and explain this" comment at line 42.

## Consumers

Full detail for each lives in `docs/backlog.md`.

- **jscad-fluent**: its wrapper copies every field
  (`Object.assign(this, geometry)`) and every method re-wraps the raw
  result, so `anchors` rides along unchanged. `FluentGeom2` and `FluentGeom3`
  have `.withAnchors`, `.anchor`, `.attachTo`, and `.alignTo`. All generated
  methods import modeling from `@jbroll/jscad-anchors`, so the booleans are
  the anchored ones and `.subtract` takes `{ carry }`.
- **Transpiler (jscadui)**: BOSL2's `attachable()` already builds a `geom`
  description, places the shape with `multmatrix`, and tracks `$parent_*`.
  A transpiler change would special-case `attachable` in module dispatch to
  wrap the shape with `withAnchors`, resolving each anchor by calling
  transpiled BOSL2 `_find_anchor` and converting with `fromBosl2`, storing
  frames before the `multmatrix` (so the lazy transform carries them), and
  emitting the anchor-preserving booleans so a `diff()` result keeps the
  parent's frames.
- **jscad-ai-studio**: `jscad-work measure --anchors` would list world
  frames per part; `verify-spec` would gain anchor assertions (origin
  distance and axis angle from frames, no mesh analysis), replacing its
  mesh-detection "Hole alignment across parts" check.

## JSCAD v3

Anchors are built on v2 `fork-main`, checked against v3 `3.0.7-alpha.0`
(alpha since 2023, one maintainer, no release plan) so the design is written
to port cleanly. What this package relies on is unchanged in v3: lazy
transforms that copy extra fields, `clone` copying all fields, in-place
baking in `applyTransforms` from the same callers, and constructive
operations returning new geometry. What changes on the move: geom2 stores
`outlines` instead of `sides` (only `basisOf` changes); `geom2/reverse`
keeps only `color` on v3, so a raw geom2 mirror always drops `anchors` there
— the wrapper's mirror handling covers it regardless; the group table is
regenerated from v3's flat exports.

`measureBoundingBox` caches per object in a `WeakMap`, on v2 `fork-main`
(`measurements/measureBoundingBox.js:11`) as well as v3. This was checked and
cannot give default anchors a stale box: an in-place bake leaves the object's
world geometry unchanged, so a cached box stays right, and a lazy transform
returns a new object, which has no cache entry.

## Where the package lives

`@jbroll/jscad-anchors` is its own repository, beside jscad-fluent, rather
than living inside the OpenJSCAD.org fork or jscadui. This keeps the fork as
close to upstream as possible (it carries only one related fix, `2e81bb3a`:
`geom2/reverse` keeps the geometry's fields — a JSCAD bug, colored geom2
mirroring lost its color, to submit upstream separately; anchors do not
depend on it) and lets anchors version and release independently of
modeling. The cost is a fifth sibling checkout and keeping the wrapper's
group table in step with the modeling releases it wraps.

Rejected: `packages/anchors` in the OpenJSCAD.org fork (adds a package to
the fork beyond the one hook); anchors inside `packages/modeling` itself
(every anchor change becomes fork divergence); `packages/anchors` in jscadui
(jscad-fluent would then depend on jscadui, whose packages aren't
published); a subpath export of jscad-fluent (transpiled output would then
depend on jscad-fluent).

## Remaining open questions

1. **Extrusion caps.** Should extrusions lift 2D frames to the bottom cap,
   both caps, or neither? Not decided; extrusions currently drop frames.
2. **Eager vs. lazy BOSL2 resolution.** Should a transpiled attachable
   resolve all BOSL2 anchors eagerly per shape, or store the `geom`
   description and resolve lazily on first lookup? Resolving all 27
   direction anchors eagerly for every attachable may cost too much in large
   BOSL2 models.
3. **Serializers and `format-jscad`.** Do JSCAD's serializers, and
   `format-jscad` specifically, ignore the extra `anchors` field on
   geometry, or choke on it? Not checked.
4. **Upstream field hook.** Should jscad-anchors offer JSCAD (v2 master, v3,
   or both) a small field hook — a value under
   `Symbol.for('jscad.transformField')` defining
   `(matrix, newGeometry) => newValue`, called by `applyTransforms` and
   `geom2/reverse` before resetting `transforms` — so raw modeling calls on
   anchored geometry become safe and the wrapper's baking step can be
   dropped? About ten lines, and it knows nothing about anchors specifically.
