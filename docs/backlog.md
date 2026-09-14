# Backlog

## jscad-fluent integration

Add anchors to the fluent wrapper (`/home/john/src/jscad-fluent`):

- `.withAnchors(frames)`, `.anchor(name)`, `.anchors()` — thin calls into
  this package; the fluent constructor already copies every field
  (`Object.assign(this, geometry)`, `src/gen/FluentGeom3.ts:33-35`) and every
  transform method wraps the raw result (`_wrap`, lines 38-40), so `anchors`
  rides along with no change to that machinery.
- `.attachTo(parent, parentAnchor, childAnchor, options)`, `.alignTo(parent,
  direction, options)`.
- `.union`/`.subtract`/`.intersect` call `unionAnchored`, `subtractAnchored`,
  `intersectAnchored` instead of raw `booleans` (currently
  `src/gen/FluentGeom3.ts:124-131`); `.subtract` takes `{ carry }`.
- geom2 and path2 fluent classes get the same, where meaningful.
- Every generated method imports modeling namespaces from
  `@jbroll/jscad-anchors` instead of `@jscad/modeling`, so every fluent call
  goes through the wrapper.
- jscad-fluent's `package.json` gets a dependency on `@jbroll/jscad-anchors`,
  declared the way it already declares modeling: a peer range for
  publishing, plus a `file:../jscad-anchors` link for local development.

## Transpiler (jscadui)

`packages/openscad` in jscadui transpiles BOSL2's `attachable()`
(`.deps-cache/bosl2-lib/attachments.scad:2404-2450`), which builds a `geom`
description with `attach_geom` (line 2821), places the shape with
`multmatrix(_attach_transform(...))`, and sets `$parent_*` special variables
already tracked by the transpiler (`src/transpiler/specialVars.ts:19-24`).

- Special-case `attachable` in module dispatch
  (`src/transpiler/statements.ts:521-564`, where `for`, `color`, `hull`, and
  `children` are already routed) to wrap the shape child's result with
  `withAnchors`.
- Import `@jbroll/jscad-anchors` in generated code
  (`helpers/imports.ts`) and add it to `openscad-runtime`'s dependencies;
  generated code and `openscad-runtime` import modeling through
  `@jbroll/jscad-anchors` rather than raw `@jscad/modeling`, so runtime
  helpers such as `_multmatrix` and the extrusions go through the wrapper.
- Resolve frames by calling the transpiled `_find_anchor(anchor, geom)`
  (attachments.scad:3313), which returns `[anchor, pos, vec, spin]`, for
  each named anchor and each of the 26 direction vectors in `last(geom)`,
  converting each with `fromBosl2`.
- Store frames before `multmatrix(m)` is applied, so the lazy transform
  carries them.
- Emit the anchor-preserving booleans, so a BOSL2 `diff()` result keeps the
  parent's frames.

Open question carried from the spec: resolve all 27 anchors eagerly per
attachable, or store the `geom` description and resolve lazily on first
lookup — eager resolution may cost too much in large BOSL2 models.

## BOSL2 cross-check test

`fromBosl2` and the default-anchor orientation rule (`defaults.js`'s
`yHint`) are currently tested against values hand-derived from BOSL2 source
(`affine3d_rot_from_to`, `vector_axis`, `_compute_spin`). Add a test that
instead compares them against BOSL2's own `_find_anchor` results, evaluated
through the jscadui transpiler, for cuboid, cylinder, and sphere
attachables — no OpenSCAD binary needed, but needs jscadui, so it can't live
in this repository until the transpiler work above lands.

## jscad-ai-studio

- `jscad-work measure --anchors` lists world frames per part; `lib/` loads
  modeling through `@jbroll/jscad-anchors` so its own `measure` and `check`
  calls don't bake anchored geometry behind the wrapper's back.
- `verify-spec` gains anchor assertions, for example
  `{ "a": "0:bolt1.axis", "b": "1:axis", "coincident": { "tolerance": 0.01, "angle": 0.1 } }`,
  checking origin distance and axis angle from frames directly, no mesh
  analysis.
- This replaces the "Hole alignment across parts" item in jscad-ai-studio's
  own backlog, which currently detects alignment after the fact from
  meshes and cannot find holes inside a part.
- `skills/jscad-assembly` gets taught `attach` and `subtractAnchored` with
  `carry`.

## `anchorArrows` viewer screenshot test

`anchorArrows` renders geom3 arrows correctly per `test/debug.test.js`, but
nothing checks that they render correctly in an actual viewer. Belongs with
whichever package owns a JSCAD viewer, as a screenshot test.

## Frames through hull, extrusions, expand, offset

Currently dropped in the `drop` wrap group. `hull`/`hullChain`, the
extrusions (`extrudeLinear`, `extrudeRotate`, `extrudeRectangular`,
`extrudeHelical`, `extrudeFromSlices`, `project`), `expand`, `offset`, and
`minkowski` all produce geometry with no defined relationship to the
input's frames as things stand. Extrusions are the case most worth solving:
they could lift a 2D frame into 3D, but need a rule for which cap (or both,
or neither) a frame lands on — open question, not decided.

## JSCAD v3 port

- `basisOf` changes from `polygons`/`sides` to `outlines` for geom2 (geom3
  is unaffected).
- Regenerate `src/wrap/groups.js`'s `TABLE`/`PREFIXES` from v3's flat
  exports (v3 keeps v2-style namespaces for compatibility, but the group
  table should be checked against the flat surface too).
- ESM throughout; `require`-based module boundaries in `wrap/index.js` need
  to become imports.
- v3's `measureBoundingBox` caches per object in a `WeakMap`
  (`measureBoundingBox.js:13,49-60`); default anchors must not read a stale
  box after an in-place bake — needs a test, since the current
  bounding-box-cache test (`test/lookup.test.js`, "defaults after an
  in-place bake match a freshly measured box") measures only after baking,
  not before, so it wouldn't catch a stale v3 cache read before the bake.
- About 8 known v3 call sites to update outside this repo: jscad-fluent's
  `minkowski` namespace and its `expansions` deep type import, the OpenSCAD
  runtime's `slice.fromSides` and `booleans.minkowski`, and
  jscad-ai-studio's `lib/check.js`, which reads `sides` directly — plus the
  four serializers current at `3.0.7-alpha.0`.

## Serializers and `format-jscad`

Not checked: whether JSCAD's serializers, and `format-jscad` specifically,
ignore the extra `anchors` field on geometry, or choke on it.

## Field hook upstream

Offer JSCAD (v2 master, v3, or both) the field hook described in
`docs/architecture.md`'s "Remaining open questions" — about ten lines,
letting `applyTransforms` and `geom2/reverse` call a
`Symbol.for('jscad.transformField')` method on any field before resetting
`transforms`. If accepted, raw modeling calls on anchored geometry become
safe and the wrapper's baking step can be dropped.

Separately, submit `2e81bb3a` (the fork's fix keeping `geom2/reverse`'s
extra fields, including color) upstream as a bug report: mirroring a
colored geom2 currently loses its color on both v2 master and v3.

## Test coverage gaps

Known gaps, not yet covered:

- `stripStale` (`src/wrap/index.js`, the `drop` group's helper) has no
  direct test.
- Mixed non-geometry inputs to the `matrix`/`keep` wrappers (e.g. an option
  object alongside geometry) aren't tested.
- `subtractAnchored`'s `carry` prefix collisions, and zero- or
  single-operand booleans, aren't tested.
- geom2 through `subtractAnchored`/`intersectAnchored` isn't tested (only
  `unionAnchored` has a geom2 case).
- `alignTo` with a non-integer direction (not `-1`/`0`/`1` per axis) isn't
  tested.
- `attach` with degenerate child frames isn't tested.
- `anchorArrows` with a geom2 input isn't tested.
- The bounding-box cache test (`test/lookup.test.js`) checks default anchors
  match a fresh measurement only *after* baking, not before — see "JSCAD v3
  port" above.
- Nothing tests that a new geometry-taking export landing under a `none`
  `PREFIXES` entry (rather than missing from the table entirely) would be
  caught if it actually needed a different group; `test/groups.test.js`
  only checks that every export is classified as *something*.
