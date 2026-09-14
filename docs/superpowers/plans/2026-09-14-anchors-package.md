# jscad-anchors Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@jbroll/jscad-anchors`: named frames on JSCAD geom2/geom3, `attach`/`alignTo`, anchor-preserving booleans, and a re-export of `@jscad/modeling` whose wrappers keep frames correct when modeling bakes transforms in place.

**Architecture:** CommonJS package, no build step, `node:test`. Core modules (frame math, names, storage, defaults, lookup, booleans) use raw `@jscad/modeling`. `src/wrap/` walks modeling's exports and wraps each function by a group from a checked table. `place.js` and `debug.js` sit on top of the wrapper. `src/index.js` exports wrapped modeling plus an `anchors` function-namespace.

**Tech Stack:** Node 22, `node:test` + `node:assert/strict`, `@jscad/modeling` linked from `../OpenJSCAD.org/packages/modeling` (branch `fork-main`, v2 CJS), TypeScript only for checking `src/index.d.ts`.

**Spec:** `docs/design/anchors.md`

**Scope:** This plan builds the package in this repo only. The jscad-fluent additions, the transpiler change, jscad-ai-studio work, the BOSL2 cross-check through the transpiler, the viewer screenshot test, and the v3 port go to `docs/backlog.md` (Task 9).

## Global Constraints

- Frame value: `{ origin: [x, y, z], z: [..], x: [..] }`, right-handed, orthonormal, frozen. `y = cross(z, x)`, never stored.
- Storage: `geometry.anchors = { frames: { [name]: frame }, basis: basisOf(geometry) }`; `basisOf` is `polygons` for geom3, `sides` for geom2.
- World frame = `transformFrame(geometry.transforms, localFrame)`.
- Raw-bake error message, exactly: `geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors`
- All JS API angles are radians. Only `fromBosl2` takes degrees.
- Direction names use BOSL2 words joined by `+` in axis order z, y, x: `top`/`bottom`, `front`/`back`, `left`/`right`; `center` for the zero vector. Examples: `top+right`, `top+front+left`.
- Modeling is never modified. Internal modules require raw `@jscad/modeling` and only its public exports.
- Tests run with `npm test` (`node --test "test/**/*.test.js"`).
- Comments: default to none; one or two lines of why when needed.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013P12EFdSHrL7Mev5LDGiVf
  ```
- Never push, never open a PR.

## Verified modeling facts (fork-main, 2.13.4)

- `mat4` is a plain 16-element column-major Array (`mat4/create.js`). Indices 0-2 are column 0, 12-14 the translation.
- `geom2.transform` calls `geom2.reverse` when `m[0]*m[5] - m[4]*m[1] < 0`. This fires for 3D rotations such as `rotateX(π)`, not only mirrors. `mat4.isMirroring` does not detect that case.
- `geom3.toPolygons` and `geom2.toSides` bake in place (replace the array, reset `transforms`) and are the public way to bake.
- `measureBoundingBox` caches per object in a WeakMap.
- `modifiers.generalize` returns `Object.assign({}, geometry)` with new polygons (stale `anchors`). `retessellate` returns the same object when already retessellated.
- `path2.create()` with no argument returns an empty path with identity `transforms`; lazy transforms on it expose the op's matrix.
- Types: `@jscad/modeling/src/geometries/types` exports `Geom2`, `Geom3`.
- BOSL2 spin-0 reference (`affine3d_rot_from_to`, `vector_axis`): `x = R·[1,0,0]` where `R` rotates UP to `z` about `unit(cross(UP, z))` by `acos(z.z)`; for `z = DOWN` the axis is `[0,1,0]`. BOSL2 anchor `[name, pos, dir, spin]` has frame `T(pos)·R_{UP→dir}·Rz(spin°)`.
- BOSL2 cuboid anchor spin (`_compute_spin`, attachments.scad:4506) makes frame `y` point along a hint: faces top/bottom → BACK, other faces and corners → UP, vertical edges → UP, horizontal edges → edge direction with the sign rule in Task 4.

---

### Task 1: Package scaffold and frame math

**Files:**
- Create: `package.json`, `.gitignore`, `src/frame.js`, `test/helpers.js`, `test/frame.test.js`

**Model:** `sonnet` — code is given; needs npm linking and judgment if numbers disagree.

**Interfaces:**
- Produces (`src/frame.js`): `frame(origin, z, x?) → Frame`, `frameFromY(origin, z, yHint) → Frame`, `yOf(frame) → vec3`, `rotationFromUp(z) → mat4`, `spinReference(z) → vec3`, `frameToMat4(frame) → mat4`, `mat4ToFrame(m) → Frame`, `transformFrame(matrix, frame) → Frame`, `mapFrames(frames, fn) → frozen object`.
- Produces (`test/helpers.js`): `close(actual, expected, eps = 1e-6)`, `frameClose(a, b, eps = 1e-6)`.

- [ ] **Step 1: Create `package.json` and `.gitignore`, install**

```json
{
  "name": "@jbroll/jscad-anchors",
  "version": "0.1.0",
  "description": "Named frames (anchors) on JSCAD geometry",
  "license": "MIT",
  "author": "John Roll",
  "repository": "https://github.com/jbroll/jscad-anchors",
  "main": "src/index.js",
  "types": "src/index.d.ts",
  "files": ["src"],
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  },
  "peerDependencies": {
    "@jscad/modeling": ">=2.12.0 <3"
  },
  "devDependencies": {
    "@jscad/modeling": "file:../OpenJSCAD.org/packages/modeling"
  }
}
```

`.gitignore`:
```
node_modules/
```

Run: `npm install`
Expected: creates `node_modules/@jscad/modeling` as a symlink and `package-lock.json`.

- [ ] **Step 2: Write `test/helpers.js`**

```js
'use strict'
const assert = require('node:assert/strict')

const close = (actual, expected, eps = 1e-6) => {
  assert.equal(actual.length, expected.length, `length ${actual.length} != ${expected.length}`)
  for (let i = 0; i < actual.length; i++) {
    if (!(Math.abs(actual[i] - expected[i]) <= eps)) {
      assert.fail(`[${actual}] != [${expected}] at index ${i} (eps ${eps})`)
    }
  }
}

const frameClose = (a, b, eps = 1e-6) => {
  close(a.origin, b.origin, eps)
  close(a.z, b.z, eps)
  close(a.x, b.x, eps)
}

module.exports = { close, frameClose }
```

- [ ] **Step 3: Write the failing test `test/frame.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { maths } = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const {
  frame, frameFromY, yOf, spinReference, frameToMat4, mat4ToFrame, transformFrame, mapFrames
} = require('../src/frame')

test('frame normalizes z and orthogonalizes x', () => {
  const f = frame([1, 2, 3], [0, 0, 2], [1, 0, 1])
  close(f.origin, [1, 2, 3])
  close(f.z, [0, 0, 1])
  close(f.x, [1, 0, 0])
})

test('frame is frozen', () => {
  const f = frame([0, 0, 0], [0, 0, 1])
  assert.ok(Object.isFrozen(f))
  assert.ok(Object.isFrozen(f.origin))
})

test('frame accepts a 2D origin', () => {
  close(frame([1, 2], [0, 0, 1]).origin, [1, 2, 0])
})

test('frame rejects a zero z', () => {
  assert.throws(() => frame([0, 0, 0], [0, 0, 0]), /z must be a non-zero vector/)
})

test('missing or parallel x uses the BOSL2 spin-0 reference', () => {
  close(frame([0, 0, 0], [0, 0, 1]).x, [1, 0, 0])
  close(frame([0, 0, 0], [0, 0, 5], [0, 0, 1]).x, [1, 0, 0])
  close(spinReference([0, 0, 1]), [1, 0, 0])
  close(spinReference([0, 0, -1]), [-1, 0, 0])
  close(spinReference([1, 0, 0]), [0, 0, -1])
  close(spinReference([0, 1, 0]), [1, 0, 0])
  close(spinReference([0, -1, 0]), [1, 0, 0])
})

test('frameFromY points y along the perpendicular part of the hint', () => {
  const s = Math.SQRT1_2
  const f = frameFromY([0, 0, 0], [1, 0, 1], [0, 0, 1])
  close(f.z, [s, 0, s])
  close(yOf(f), [-s, 0, s])
  close(f.x, [0, 1, 0])
})

test('frames are right-handed', () => {
  const f = frame([0, 0, 0], [1, 2, 3], [0, 1, 0])
  const y = yOf(f)
  const { vec3 } = maths
  close([vec3.dot(vec3.cross(vec3.create(), f.x, y), f.z)], [1])
})

test('frameToMat4 and mat4ToFrame round trip', () => {
  const f = frame([4, 5, 6], [0, 1, 1], [1, 0, 0])
  const m = frameToMat4(f)
  close([m[12], m[13], m[14], m[15]], [4, 5, 6, 1])
  frameClose(mat4ToFrame(m), f)
})

test('transformFrame applies translation and rotation', () => {
  const { mat4 } = maths
  const m = mat4.multiply(mat4.create(),
    mat4.fromTranslation(mat4.create(), [10, 0, 0]),
    mat4.fromZRotation(mat4.create(), Math.PI / 2))
  const f = transformFrame(m, frame([1, 0, 0], [1, 0, 0], [0, 1, 0]))
  close(f.origin, [10, 1, 0])
  close(f.z, [0, 1, 0])
  close(f.x, [-1, 0, 0])
})

test('transformFrame under a mirror stays right-handed', () => {
  const { mat4 } = maths
  const m = mat4.fromScaling(mat4.create(), [-1, 1, 1])
  const f = transformFrame(m, frame([1, 0, 0], [1, 0, 0], [0, 1, 0]))
  close(f.origin, [-1, 0, 0])
  close(f.z, [-1, 0, 0])
  close(f.x, [0, 1, 0])
  close(yOf(f), [0, 0, -1])
})

test('mapFrames maps values and freezes the result', () => {
  const out = mapFrames({ a: frame([0, 0, 0], [0, 0, 1]) }, (f) => frame([1, 1, 1], f.z, f.x))
  close(out.a.origin, [1, 1, 1])
  assert.ok(Object.isFrozen(out))
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/frame'`.

- [ ] **Step 5: Write `src/frame.js`**

```js
'use strict'
const { maths } = require('@jscad/modeling')
const { vec3, mat4 } = maths

const UP = [0, 0, 1]
const DOWN = [0, 0, -1]

const point3 = (v) => [v[0], v[1], v[2] || 0]
const freezeVec = (v) => Object.freeze(point3(v))

// BOSL2 affine3d_rot_from_to(UP, z): axis from vector_axis, which picks BACK for DOWN.
const rotationFromUp = (z) => {
  const w = vec3.normalize(vec3.create(), point3(z))
  if (vec3.distance(w, UP) < 1e-9) return mat4.create()
  const axis = vec3.distance(w, DOWN) < 1e-9
    ? [0, 1, 0]
    : vec3.normalize(vec3.create(), vec3.cross(vec3.create(), UP, w))
  const angle = Math.acos(Math.max(-1, Math.min(1, w[2])))
  return mat4.fromRotation(mat4.create(), angle, axis)
}

const spinReference = (z) => point3(vec3.transform(vec3.create(), [1, 0, 0], rotationFromUp(z)))

const frame = (origin, z, x) => {
  if (!(vec3.length(point3(z)) > 1e-12)) throw new Error('frame: z must be a non-zero vector')
  const zn = vec3.normalize(vec3.create(), point3(z))
  let xn = null
  if (x) {
    const xv = point3(x)
    const xo = vec3.subtract(vec3.create(), xv, vec3.scale(vec3.create(), zn, vec3.dot(xv, zn)))
    if (vec3.length(xo) > 1e-6 * vec3.length(xv)) xn = vec3.normalize(xo, xo)
  }
  if (!xn) xn = spinReference(zn)
  return Object.freeze({ origin: freezeVec(origin), z: freezeVec(zn), x: freezeVec(xn) })
}

const yOf = (f) => point3(vec3.cross(vec3.create(), f.z, f.x))

const frameFromY = (origin, z, yHint) => {
  const zn = vec3.normalize(vec3.create(), point3(z))
  const y = vec3.subtract(vec3.create(), point3(yHint), vec3.scale(vec3.create(), zn, vec3.dot(yHint, zn)))
  return frame(origin, zn, vec3.cross(vec3.create(), y, zn))
}

const frameToMat4 = (f) => {
  const y = yOf(f)
  return mat4.fromValues(
    f.x[0], f.x[1], f.x[2], 0,
    y[0], y[1], y[2], 0,
    f.z[0], f.z[1], f.z[2], 0,
    f.origin[0], f.origin[1], f.origin[2], 1
  )
}

const mat4ToFrame = (m) => frame([m[12], m[13], m[14]], [m[8], m[9], m[10]], [m[0], m[1], m[2]])

const linear = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
]

const transformFrame = (matrix, f) =>
  frame(vec3.transform(vec3.create(), f.origin, matrix), linear(matrix, f.z), linear(matrix, f.x))

const mapFrames = (frames, fn) =>
  Object.freeze(Object.fromEntries(Object.entries(frames).map(([name, f]) => [name, fn(f, name)])))

module.exports = {
  frame, frameFromY, yOf, rotationFromUp, spinReference, frameToMat4, mat4ToFrame, transformFrame, mapFrames
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test`
Expected: all tests in `test/frame.test.js` PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore src/frame.js test/helpers.js test/frame.test.js
git commit -m "feat: frame math and package scaffold"
```

### Task 2: Direction names and conversions

**Files:**
- Create: `src/names.js`, `src/convert.js`, `test/names.test.js`, `test/convert.test.js`

**Model:** `sonnet` — code given; BOSL2 expectations need care if a number disagrees.

**Interfaces:**
- Consumes: `frame`, `rotationFromUp`, `yOf` from `src/frame.js`.
- Produces (`src/names.js`): `DIRECTIONS` (27 `[x, y, z]` vectors including `[0,0,0]`), `directionName(vector) → string`, `parseDirection(name) → vector | null`, `canonicalName(nameOrVector) → string`.
- Produces (`src/convert.js`): `fromBosl2([name, pos, orient, spin?]) → [name, Frame]`, `fromConnector({ point, axis, normal }) → Frame`, `toConnector(frame) → { point, axis, normal }`.

- [ ] **Step 1: Write the failing tests**

`test/names.test.js`:
```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { DIRECTIONS, directionName, parseDirection, canonicalName } = require('../src/names')

test('DIRECTIONS has 27 distinct vectors including center', () => {
  assert.equal(DIRECTIONS.length, 27)
  assert.equal(new Set(DIRECTIONS.map(String)).size, 27)
  assert.ok(DIRECTIONS.some((d) => d.every((c) => c === 0)))
})

test('directionName orders words z, y, x', () => {
  assert.equal(directionName([0, 0, 1]), 'top')
  assert.equal(directionName([1, 0, 1]), 'top+right')
  assert.equal(directionName([-1, -1, 1]), 'top+front+left')
  assert.equal(directionName([1, 1, -1]), 'bottom+back+right')
  assert.equal(directionName([0, 0, 0]), 'center')
})

test('directionName rejects components outside -1, 0, 1', () => {
  assert.throws(() => directionName([0.5, 0, 1]), /direction components must be -1, 0, or 1/)
})

test('parseDirection accepts any order and BOSL2 aliases', () => {
  assert.deepEqual(parseDirection('right+top'), [1, 0, 1])
  assert.deepEqual(parseDirection('up+fwd+left'), [-1, -1, 1])
  assert.deepEqual(parseDirection('bot'), [0, 0, -1])
  assert.deepEqual(parseDirection('center'), [0, 0, 0])
})

test('parseDirection returns null for non-direction names', () => {
  assert.equal(parseDirection('bolt1.axis'), null)
  assert.equal(parseDirection('top+bottom'), null)
  assert.equal(parseDirection('top+widget'), null)
})

test('canonicalName canonicalizes directions and keeps other names', () => {
  assert.equal(canonicalName('right+top'), 'top+right')
  assert.equal(canonicalName([0, 0, 1]), 'top')
  assert.equal(canonicalName('bolt1.axis'), 'bolt1.axis')
})
```

`test/convert.test.js`:
```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { close, frameClose } = require('./helpers')
const { frame, yOf } = require('../src/frame')
const { fromBosl2, fromConnector, toConnector } = require('../src/convert')

test('fromBosl2 with UP orient rotates x by spin degrees', () => {
  const [name, f] = fromBosl2(['a', [1, 2, 3], [0, 0, 1], 90])
  assert.equal(name, 'a')
  close(f.origin, [1, 2, 3])
  close(f.z, [0, 0, 1])
  close(f.x, [0, 1, 0])
})

test('fromBosl2 spin 0 uses the rotate-from-UP reference', () => {
  close(fromBosl2(['b', [0, 0, 0], [2, 0, 0], 0])[1].x, [0, 0, -1])
  close(fromBosl2(['c', [0, 0, 0], [0, 0, -1]])[1].x, [-1, 0, 0])
})

test('fromBosl2 cube RIGHT face with spin 90 has y pointing UP', () => {
  const f = fromBosl2(['right', [1, 0, 0], [1, 0, 0], 90])[1]
  close(f.x, [0, 1, 0])
  close(yOf(f), [0, 0, 1])
})

test('fromBosl2 accepts a 2D position and ignores extra info', () => {
  close(fromBosl2(['d', [1, 2], [0, 0, 1], 0, [['edge_angle', 90]]])[1].origin, [1, 2, 0])
})

test('fromConnector maps point, axis, normal to origin, z, x', () => {
  const f = fromConnector({ point: [1, 2, 3], axis: [0, 0, 1], normal: [1, 0, 0] })
  frameClose(f, frame([1, 2, 3], [0, 0, 1], [1, 0, 0]))
})

test('toConnector round trips through fromConnector', () => {
  const f = frame([4, 5, 6], [0, 1, 0], [0, 0, 1])
  const c = toConnector(f)
  close(c.point, [4, 5, 6])
  close(c.axis, [0, 1, 0])
  close(c.normal, [0, 0, 1])
  frameClose(fromConnector(c), f)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/names'` and `'../src/convert'`.

- [ ] **Step 3: Write `src/names.js`**

```js
'use strict'

const WORDS = {
  top: [2, 1], up: [2, 1], bottom: [2, -1], bot: [2, -1], down: [2, -1],
  back: [1, 1], front: [1, -1], fwd: [1, -1], forward: [1, -1],
  right: [0, 1], left: [0, -1]
}
const AXIS_WORDS = [['left', 'right'], ['front', 'back'], ['bottom', 'top']]
const NAME_ORDER = [2, 1, 0]

const DIRECTIONS = []
for (const z of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const x of [-1, 0, 1]) DIRECTIONS.push([x, y, z])

const directionName = (vector) => {
  const v = [0, 1, 2].map((i) => {
    const c = vector[i] || 0
    const r = Math.round(c)
    if (Math.abs(c - r) > 1e-9 || Math.abs(r) > 1) {
      throw new Error(`direction components must be -1, 0, or 1: [${vector}]`)
    }
    return r
  })
  const words = NAME_ORDER.filter((i) => v[i] !== 0).map((i) => AXIS_WORDS[i][v[i] > 0 ? 1 : 0])
  return words.length ? words.join('+') : 'center'
}

const parseDirection = (name) => {
  if (name === 'center') return [0, 0, 0]
  const v = [0, 0, 0]
  for (const word of name.split('+')) {
    const w = WORDS[word]
    if (!w || v[w[0]] !== 0) return null
    v[w[0]] = w[1]
  }
  return v
}

const canonicalName = (nameOrVector) => {
  if (Array.isArray(nameOrVector)) return directionName(nameOrVector)
  const v = parseDirection(nameOrVector)
  return v ? directionName(v) : nameOrVector
}

module.exports = { DIRECTIONS, directionName, parseDirection, canonicalName }
```

- [ ] **Step 4: Write `src/convert.js`**

```js
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
```

Note: `rotationFromUp` must accept a 3-vector `orient` that is not unit length; it normalizes internally.

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/names.js src/convert.js test/names.test.js test/convert.test.js
git commit -m "feat: direction names and BOSL2/connector conversion"
```

### Task 3: Storage, baking, and raw-bake detection

**Files:**
- Create: `src/storage.js`, `test/storage.test.js`

**Model:** `sonnet` — code given; the in-place bake semantics are subtle.

**Interfaces:**
- Consumes: `frame`, `transformFrame`, `mapFrames` (`src/frame.js`); `canonicalName` (`src/names.js`).
- Produces (`src/storage.js`):
  - `BAKED_OUTSIDE` — the exact error string from Global Constraints.
  - `basisOf(geometry) → Array | undefined` (`polygons` for geom3, `sides` for geom2).
  - `isAnchorable(geometry) → boolean`.
  - `localFrames(geometry) → frozen { name: Frame }`; `{}` without anchors; throws `BAKED_OUTSIDE` on basis mismatch.
  - `worldFrames(geometry) → frozen { name: Frame }`.
  - `withAnchors(geometry, { name: frame }) → new geometry`; merges over existing explicit frames; canonicalizes direction names; throws for non geom2/geom3.
  - `withWorldFrames(geometry, frames) → new geometry` with `anchors = { frames, basis: basisOf(geometry) }`; returns `geometry` unchanged when `frames` is empty and it has no anchors. Only valid when `geometry.transforms` is identity or the frames are already local.
  - `bake(geometry) → geometry` — bakes in place on the caller's object and rebases anchors; no-op for unanchored or identity-transform geometry.
  - `bakeAll(args)` — `bake` on every element, recursing into plain Arrays.

- [ ] **Step 1: Write the failing test `test/storage.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const {
  BAKED_OUTSIDE, basisOf, isAnchorable, localFrames, worldFrames, withAnchors, withWorldFrames, bake, bakeAll
} = require('../src/storage')

const { cuboid, rectangle } = raw.primitives
const { translate, rotateZ } = raw.transforms
const f0 = frame([1, 0, 0], [1, 0, 0], [0, 1, 0])

test('BAKED_OUTSIDE text is exact', () => {
  assert.equal(BAKED_OUTSIDE, 'geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors')
})

test('basisOf returns polygons for geom3 and sides for geom2', () => {
  const c = cuboid()
  const r = rectangle()
  assert.equal(basisOf(c), c.polygons)
  assert.equal(basisOf(r), r.sides)
  assert.equal(basisOf(raw.geometries.path2.create()), undefined)
  assert.equal(isAnchorable(c), true)
  assert.equal(isAnchorable({}), false)
})

test('withAnchors returns a new geometry and leaves the input alone', () => {
  const c = cuboid()
  const a = withAnchors(c, { p: f0 })
  assert.notEqual(a, c)
  assert.equal(c.anchors, undefined)
  assert.equal(a.anchors.basis, c.polygons)
  frameClose(localFrames(a).p, f0)
})

test('withAnchors merges and canonicalizes direction names', () => {
  const a = withAnchors(withAnchors(cuboid(), { p: f0 }), { 'right+top': f0 })
  assert.deepEqual(Object.keys(localFrames(a)).sort(), ['p', 'top+right'])
})

test('withAnchors rejects path2', () => {
  assert.throws(() => withAnchors(raw.geometries.path2.create(), { p: f0 }), /geom2 or geom3/)
})

test('worldFrames applies lazy transforms', () => {
  const a = rotateZ(Math.PI / 2, translate([10, 0, 0], withAnchors(cuboid(), { p: f0 })))
  const w = worldFrames(a).p
  close(w.origin, [0, 11, 0])
  close(w.z, [0, 1, 0])
  close(w.x, [-1, 0, 0])
})

test('geometry without anchors has no frames', () => {
  assert.deepEqual(worldFrames(cuboid()), {})
})

test('raw measureBoundingBox on a transformed anchored geom3 is detected', () => {
  const a = translate([10, 0, 0], withAnchors(cuboid(), { p: f0 }))
  raw.measurements.measureBoundingBox(a)
  assert.throws(() => worldFrames(a), { message: BAKED_OUTSIDE })
})

test('raw boolean on a transformed anchored geom3 is detected', () => {
  const a = translate([10, 0, 0], withAnchors(cuboid(), { p: f0 }))
  raw.booleans.union(a, cuboid())
  assert.throws(() => worldFrames(a), { message: BAKED_OUTSIDE })
})

test('raw toSides on a transformed anchored geom2 is detected', () => {
  const a = translate([10, 0, 0], withAnchors(rectangle(), { p: f0 }))
  raw.geometries.geom2.toSides(a)
  assert.throws(() => worldFrames(a), { message: BAKED_OUTSIDE })
})

test('bake keeps world frames and makes later raw calls safe', () => {
  for (const shape of [cuboid(), rectangle()]) {
    const a = translate([10, 0, 0], withAnchors(shape, { p: f0 }))
    const before = worldFrames(a).p
    assert.equal(bake(a), a)
    assert.ok(raw.maths.mat4.isIdentity(a.transforms))
    assert.equal(a.anchors.basis, basisOf(a))
    frameClose(worldFrames(a).p, before)
    raw.measurements.measureBoundingBox(a)
    frameClose(worldFrames(a).p, before)
  }
})

test('bake is a no-op for unanchored and untransformed geometry', () => {
  const plain = translate([1, 0, 0], cuboid())
  const polygons = plain.polygons
  bake(plain)
  assert.equal(plain.polygons, polygons)
  const anchored = withAnchors(cuboid(), { p: f0 })
  const anchors = anchored.anchors
  bake(anchored)
  assert.equal(anchored.anchors, anchors)
})

test('bakeAll recurses into arrays', () => {
  const a = translate([1, 0, 0], withAnchors(cuboid(), { p: f0 }))
  const b = translate([2, 0, 0], withAnchors(rectangle(), { p: f0 }))
  bakeAll([{ option: true }, [a, [b]]])
  assert.ok(raw.maths.mat4.isIdentity(a.transforms))
  assert.ok(raw.maths.mat4.isIdentity(b.transforms))
})

test('withWorldFrames sets frames against the geometry basis', () => {
  const c = cuboid()
  const out = withWorldFrames(c, { q: f0 })
  assert.equal(out.anchors.basis, c.polygons)
  frameClose(worldFrames(out).q, f0)
  assert.equal(withWorldFrames(c, {}), c)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/storage'`.

- [ ] **Step 3: Write `src/storage.js`**

```js
'use strict'
const { geometries, maths } = require('@jscad/modeling')
const { frame, transformFrame, mapFrames } = require('./frame')
const { canonicalName } = require('./names')

const { geom2, geom3 } = geometries
const { mat4 } = maths

const BAKED_OUTSIDE = 'geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors'

const basisOf = (geometry) => {
  if (geom3.isA(geometry)) return geometry.polygons
  if (geom2.isA(geometry)) return geometry.sides
  return undefined
}

const isAnchorable = (geometry) => basisOf(geometry) !== undefined

const localFrames = (geometry) => {
  const anchors = geometry && geometry.anchors
  if (!anchors) return Object.freeze({})
  if (basisOf(geometry) !== anchors.basis) throw new Error(BAKED_OUTSIDE)
  return anchors.frames
}

const worldFrames = (geometry) => {
  const local = localFrames(geometry)
  if (!geometry || !geometry.transforms || mat4.isIdentity(geometry.transforms)) return local
  return mapFrames(local, (f) => transformFrame(geometry.transforms, f))
}

const withAnchors = (geometry, frames) => {
  const basis = basisOf(geometry)
  if (!basis) throw new Error('withAnchors: geometry must be geom2 or geom3')
  const merged = Object.assign({}, localFrames(geometry))
  for (const [name, f] of Object.entries(frames)) merged[canonicalName(name)] = frame(f.origin, f.z, f.x)
  return Object.assign({}, geometry, { anchors: { frames: Object.freeze(merged), basis } })
}

const withWorldFrames = (geometry, frames) => {
  if (Object.keys(frames).length === 0 && !geometry.anchors) return geometry
  return Object.assign({}, geometry, { anchors: { frames: Object.freeze(Object.assign({}, frames)), basis: basisOf(geometry) } })
}

const bake = (geometry) => {
  if (!geometry || !geometry.anchors || !isAnchorable(geometry)) return geometry
  const frames = worldFrames(geometry)
  if (mat4.isIdentity(geometry.transforms)) return geometry
  if (geom3.isA(geometry)) geom3.toPolygons(geometry)
  else geom2.toSides(geometry)
  geometry.anchors = { frames, basis: basisOf(geometry) }
  return geometry
}

const bakeAll = (args) => {
  for (const arg of args) {
    if (Array.isArray(arg)) bakeAll(arg)
    else bake(arg)
  }
}

module.exports = {
  BAKED_OUTSIDE, basisOf, isAnchorable, localFrames, worldFrames, withAnchors, withWorldFrames, bake, bakeAll
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests PASS. If `rectangle()` returns a geom2 whose `transforms` is identity, the geom2 cases still work because each test translates first.

- [ ] **Step 5: Commit**

```bash
git add src/storage.js test/storage.test.js
git commit -m "feat: anchor storage, in-place bake handling, raw-bake detection"
```

### Task 4: Default anchors and lookup

**Files:**
- Create: `src/defaults.js`, `src/lookup.js`, `test/defaults.test.js`, `test/lookup.test.js`

**Model:** `sonnet` — code given; frame expectations are hand-derived from BOSL2.

**Interfaces:**
- Consumes: `frame`, `frameFromY` (`src/frame.js`); `DIRECTIONS`, `directionName`, `parseDirection`, `canonicalName` (`src/names.js`); `bake`, `isAnchorable`, `worldFrames` (`src/storage.js`).
- Produces (`src/defaults.js`): `yHint(direction) → vec3`, `defaultFrame(geometry, direction) → Frame`, `defaultFrames(geometry) → frozen { name: Frame }` (27 entries).
- Produces (`src/lookup.js`): `anchors(geometry) → frozen { name: worldFrame }` (explicit only), `anchor(geometry, nameOrVector) → worldFrame` (explicit, then default; throws `anchor: unknown anchor "<name>"`).

Default rule: `origin = center + d ⊙ halfExtent` from the bounding box after transforms; `z = normalize(d)`; `center` has `z = [0,0,1]`, `x = [1,0,0]`. `x` is chosen so `y` follows BOSL2's cuboid spin hint:
- one nonzero component: `BACK` if it is z, else `UP`;
- three nonzero: `UP`;
- two nonzero: face vectors `f0, f1` in x, y, z order (`[d.x,0,0]`, `[0,d.y,0]`, `[0,0,d.z]`), `e = unit(cross(f0, f1))`. If `e.z ≠ 0`, hint `e * sign(e.z)`. Else hint `e` when `cross(UP, e) ≈ unit([d.x, d.y, 0]) * d.z`, otherwise `-e`.

- [ ] **Step 1: Write the failing tests**

`test/defaults.test.js`:
```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close } = require('./helpers')
const { yOf } = require('../src/frame')
const { defaultFrame, defaultFrames, yHint } = require('../src/defaults')

const { cuboid, rectangle } = raw.primitives
const s = Math.SQRT1_2
const box = () => cuboid({ size: [2, 4, 6], center: [1, 2, 3] })

const expectFrame = (d, origin, z, x) => {
  const f = defaultFrame(box(), d)
  close(f.origin, origin)
  close(f.z, z)
  close(f.x, x)
}

test('center', () => expectFrame([0, 0, 0], [1, 2, 3], [0, 0, 1], [1, 0, 0]))
test('top face', () => expectFrame([0, 0, 1], [1, 2, 6], [0, 0, 1], [1, 0, 0]))
test('bottom face', () => expectFrame([0, 0, -1], [1, 2, 0], [0, 0, -1], [-1, 0, 0]))
test('right face', () => expectFrame([1, 0, 0], [2, 2, 3], [1, 0, 0], [0, 1, 0]))
test('front face', () => expectFrame([0, -1, 0], [1, 0, 3], [0, -1, 0], [1, 0, 0]))
test('top+right edge', () => expectFrame([1, 0, 1], [2, 2, 6], [s, 0, s], [-s, 0, s]))
test('top+front edge', () => expectFrame([0, -1, 1], [1, 0, 6], [0, -s, s], [0, s, s]))
test('back+right vertical edge', () => expectFrame([1, 1, 0], [2, 4, 3], [s, s, 0], [-s, s, 0]))
test('top+back+right corner', () => {
  const f = defaultFrame(box(), [1, 1, 1])
  close(f.origin, [2, 4, 6])
  close(f.x, [-s, s, 0])
})

test('yHint follows the BOSL2 cuboid spin rule', () => {
  close(yHint([0, 0, 1]), [0, 1, 0])
  close(yHint([1, 0, 0]), [0, 0, 1])
  close(yHint([1, 1, 1]), [0, 0, 1])
  close(yHint([1, 1, 0]), [0, 0, 1])
  close(yHint([1, 0, 1]), [0, -1, 0])
  close(yHint([-1, 0, -1]), [0, -1, 0])
  close(yHint([0, -1, 1]), [-1, 0, 0])
})

test('side-face frames have y pointing up', () => {
  close(yOf(defaultFrame(box(), [-1, 0, 0])), [0, 0, 1])
})

test('geom2 defaults use its bounding box', () => {
  const f = defaultFrame(rectangle({ size: [4, 2] }), [1, 0, 0])
  close(f.origin, [2, 0, 0])
  close(f.z, [1, 0, 0])
})

test('defaultFrames names all 27 directions', () => {
  const frames = defaultFrames(box())
  assert.equal(Object.keys(frames).length, 27)
  assert.ok(frames['top+front+left'])
  assert.ok(frames.center)
})

test('defaults follow lazy transforms', () => {
  const g = raw.transforms.translate([10, 0, 0], box())
  close(defaultFrame(g, [0, 0, 1]).origin, [11, 2, 6])
})

test('defaultFrame rejects path2', () => {
  assert.throws(() => defaultFrame(raw.geometries.path2.create(), [0, 0, 1]), /geom2 or geom3/)
})
```

`test/lookup.test.js`:
```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors, bake } = require('../src/storage')
const { anchors, anchor } = require('../src/lookup')

const { cuboid } = raw.primitives
const { translate } = raw.transforms
const f0 = frame([0, 0, 0], [1, 0, 0], [0, 1, 0])

test('anchors returns explicit world frames only', () => {
  const g = translate([5, 0, 0], withAnchors(cuboid(), { p: f0 }))
  assert.deepEqual(Object.keys(anchors(g)), ['p'])
  close(anchors(g).p.origin, [5, 0, 0])
})

test('anchor prefers explicit frames over defaults', () => {
  const g = withAnchors(cuboid(), { top: f0 })
  frameClose(anchor(g, 'top'), f0)
  frameClose(anchor(g, [0, 0, 1]), f0)
})

test('anchor falls back to defaults by name or vector', () => {
  const g = cuboid({ size: [2, 2, 2] })
  close(anchor(g, 'right+top').origin, [1, 0, 1])
  close(anchor(g, [1, 0, 1]).origin, [1, 0, 1])
})

test('anchor throws for unknown names', () => {
  assert.throws(() => anchor(cuboid(), 'bolt9'), /unknown anchor "bolt9"/)
})

test('defaults after an in-place bake match a freshly measured box', () => {
  const g = translate([5, 0, 0], withAnchors(cuboid({ size: [2, 2, 2] }), { p: f0 }))
  const before = anchor(g, 'top')
  bake(g)
  const [min, max] = raw.measurements.measureBoundingBox(translate([5, 0, 0], cuboid({ size: [2, 2, 2] })))
  const expected = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2]]
  close(anchor(g, 'top').origin, expected)
  frameClose(anchor(g, 'top'), before)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/defaults'` and `'../src/lookup'`.

- [ ] **Step 3: Write `src/defaults.js`**

```js
'use strict'
const { maths, measurements } = require('@jscad/modeling')
const { frame, frameFromY } = require('./frame')
const { DIRECTIONS, directionName } = require('./names')
const { bake, isAnchorable } = require('./storage')

const { vec3 } = maths
const UP = [0, 0, 1]
const BACK = [0, 1, 0]

const yHint = (d) => {
  const nonzero = d.filter((c) => c !== 0).length
  if (nonzero === 1) return d[2] !== 0 ? BACK : UP
  if (nonzero !== 2) return UP
  const faces = [[d[0], 0, 0], [0, d[1], 0], [0, 0, d[2]]].filter((_, i) => d[i] !== 0)
  const e = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), faces[0], faces[1]))
  if (Math.abs(e[2]) > 1e-9) return vec3.scale(vec3.create(), e, Math.sign(e[2]))
  const c = vec3.cross(vec3.create(), UP, e)
  const target = vec3.scale(vec3.create(), vec3.normalize(vec3.create(), [d[0], d[1], 0]), d[2])
  return vec3.distance(c, target) < 1e-9 ? e : vec3.negate(vec3.create(), e)
}

const defaultFrame = (geometry, d) => {
  if (!isAnchorable(geometry)) throw new Error('anchor: geometry must be geom2 or geom3')
  bake(geometry)
  const [min, max] = measurements.measureBoundingBox(geometry)
  const origin = [0, 1, 2].map((i) => (min[i] + max[i]) / 2 + d[i] * (max[i] - min[i]) / 2)
  if (d.every((c) => c === 0)) return frame(origin, UP, [1, 0, 0])
  return frameFromY(origin, d, yHint(d))
}

const defaultFrames = (geometry) =>
  Object.freeze(Object.fromEntries(DIRECTIONS.map((d) => [directionName(d), defaultFrame(geometry, d)])))

module.exports = { yHint, defaultFrame, defaultFrames }
```

- [ ] **Step 4: Write `src/lookup.js`**

```js
'use strict'
const { canonicalName, parseDirection } = require('./names')
const { isAnchorable, worldFrames } = require('./storage')
const { defaultFrame } = require('./defaults')

const anchors = (geometry) => worldFrames(geometry)

const anchor = (geometry, nameOrVector) => {
  if (!isAnchorable(geometry)) throw new Error('anchor: geometry must be geom2 or geom3')
  const name = canonicalName(nameOrVector)
  const explicit = worldFrames(geometry)
  if (Object.hasOwn(explicit, name)) return explicit[name]
  const d = parseDirection(name)
  if (d) return defaultFrame(geometry, d)
  throw new Error(`anchor: unknown anchor "${name}"`)
}

module.exports = { anchors, anchor }
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/defaults.js src/lookup.js test/defaults.test.js test/lookup.test.js
git commit -m "feat: bounding-box default anchors and anchor lookup"
```

### Task 5: Anchor-preserving booleans

**Files:**
- Create: `src/booleans.js`, `test/booleans.test.js`

**Model:** `sonnet` — code given.

**Interfaces:**
- Consumes: `bake`, `basisOf`, `worldFrames`, `withWorldFrames` (`src/storage.js`).
- Produces (`src/booleans.js`): `unionAnchored(...geometries)`, `subtractAnchored(...geometries, { carry }?)`, `intersectAnchored(...geometries)`. Each flattens nested arrays like modeling, bakes anchored inputs on the caller's objects, calls raw `@jscad/modeling` booleans, and returns the raw result with world frames attached:
  - union: frames of all operands in flattened order, first name wins;
  - subtract: frames of the first operand, plus explicit frames of each `carry[prefix]` geometry as `prefix.name` (existing names win);
  - intersect: frames of the first operand.

- [ ] **Step 1: Write the failing test `test/booleans.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../src/booleans')

const { cuboid, cylinder, rectangle } = raw.primitives
const { translate, rotateZ } = raw.transforms
const at = (x) => frame([x, 0, 0], [0, 0, 1])

test('union keeps the first operand on name clashes and adds new names', () => {
  const a = withAnchors(cuboid(), { p: at(0) })
  const b = translate([10, 0, 0], withAnchors(cuboid(), { p: at(1), q: at(2) }))
  const r = unionAnchored(a, b)
  const frames = worldFrames(r)
  close(frames.p.origin, [0, 0, 0])
  close(frames.q.origin, [12, 0, 0])
  assert.ok(raw.maths.mat4.isIdentity(r.transforms))
})

test('union flattens arrays in order', () => {
  const a = withAnchors(cuboid(), { p: at(1) })
  const b = withAnchors(cuboid(), { p: at(2) })
  close(worldFrames(unionAnchored([a, [b]])).p.origin, [1, 0, 0])
})

test('union converts transformed operands to world space', () => {
  const a = rotateZ(Math.PI / 2, withAnchors(cuboid(), { f: frame([1, 0, 0], [1, 0, 0]) }))
  const f = worldFrames(unionAnchored(a, cuboid())).f
  close(f.origin, [0, 1, 0])
  close(f.z, [0, 1, 0])
})

test('operands stay readable after the boolean', () => {
  const a = translate([3, 0, 0], withAnchors(cuboid(), { p: at(0) }))
  unionAnchored(a, cuboid())
  close(worldFrames(a).p.origin, [3, 0, 0])
})

test('subtract keeps the first operand frames and drops tool frames', () => {
  const plate = withAnchors(cuboid({ size: [20, 20, 2] }), { corner: at(10) })
  const tool = withAnchors(cylinder({ radius: 1, height: 4 }), { axis: at(0) })
  const frames = worldFrames(subtractAnchored(plate, tool))
  assert.deepEqual(Object.keys(frames), ['corner'])
})

test('subtract carry adds prefixed world frames of the tool', () => {
  const plate = cuboid({ size: [20, 20, 2] })
  const cyl = translate([5, 0, 0], withAnchors(cylinder({ radius: 1, height: 4 }), { axis: frame([0, 0, 0], [0, 0, 1]) }))
  const r = subtractAnchored(plate, cyl, { carry: { bolt1: cyl } })
  const frames = worldFrames(r)
  assert.deepEqual(Object.keys(frames), ['bolt1.axis'])
  close(frames['bolt1.axis'].origin, [5, 0, 0])
  close(frames['bolt1.axis'].z, [0, 0, 1])
})

test('intersect keeps only the first operand frames', () => {
  const a = withAnchors(cuboid({ size: [4, 4, 4] }), { p: at(0) })
  const b = withAnchors(cuboid({ size: [2, 2, 2] }), { q: at(0) })
  assert.deepEqual(Object.keys(worldFrames(intersectAnchored(a, b))), ['p'])
})

test('geom2 booleans keep frames', () => {
  const a = translate([1, 0, 0], withAnchors(rectangle({ size: [4, 4] }), { p: at(0) }))
  const r = unionAnchored(a, rectangle({ size: [2, 2] }))
  close(worldFrames(r).p.origin, [1, 0, 0])
  assert.equal(r.anchors.basis, r.sides)
})

test('no frames means the raw result is returned unchanged', () => {
  const r = unionAnchored(cuboid(), translate([0.5, 0, 0], cuboid()))
  assert.equal(r.anchors, undefined)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/booleans'`.

- [ ] **Step 3: Write `src/booleans.js`**

```js
'use strict'
const { booleans, geometries, utils } = require('@jscad/modeling')
const { bake, basisOf, worldFrames, withWorldFrames } = require('./storage')

const merge = (target, frames, prefix) => {
  for (const [name, f] of Object.entries(frames)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (!Object.hasOwn(target, key)) target[key] = f
  }
}

const isOptions = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  basisOf(value) === undefined && !geometries.path2.isA(value)

const unionAnchored = (...geometries) => {
  const items = utils.flatten(geometries)
  items.forEach(bake)
  const result = booleans.union(items)
  const frames = {}
  for (const item of items) merge(frames, worldFrames(item))
  return withWorldFrames(result, frames)
}

const subtractAnchored = (...args) => {
  const options = isOptions(args[args.length - 1]) ? args.pop() : {}
  const items = utils.flatten(args)
  items.forEach(bake)
  const result = booleans.subtract(items)
  const frames = {}
  merge(frames, worldFrames(items[0]))
  for (const [prefix, tool] of Object.entries(options.carry || {})) {
    bake(tool)
    merge(frames, worldFrames(tool), prefix)
  }
  return withWorldFrames(result, frames)
}

const intersectAnchored = (...geometries) => {
  const items = utils.flatten(geometries)
  items.forEach(bake)
  const result = booleans.intersect(items)
  return withWorldFrames(result, Object.assign({}, worldFrames(items[0])))
}

module.exports = { unionAnchored, subtractAnchored, intersectAnchored }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/booleans.js test/booleans.test.js
git commit -m "feat: anchor-preserving union, subtract with carry, intersect"
```

### Task 6: Wrapper grouping table and export coverage

**Files:**
- Create: `src/wrap/listFunctions.js`, `src/wrap/groups.js`, `scripts/list-exports.js`, `test/groups.test.js`
- Modify: `package.json` (add `"exports:check": "node scripts/list-exports.js"` to `scripts`)

**Model:** `sonnet` — table is given; implementer must reconcile it against live exports.

**Interfaces:**
- Produces (`src/wrap/listFunctions.js`): `listFunctions(node, prefix = '') → [{ path, fn }]`, walking plain objects (not arrays or typed arrays), dotted paths.
- Produces (`src/wrap/groups.js`): `TABLE` (`{ path: [group, arity, lead?] }`), `PREFIXES` (`{ pathPrefix: group }`), `GROUPS` (array of group names), `classify(path) → { group, arity?, lead } | undefined` (exact entry first, else longest matching prefix; `lead` defaults to 0).

Groups:
- `none`: not geometry-taking; raw function.
- `lazy`: lazy transform or clone; raw function, anchors ride along.
- `bake`: bakes its inputs; wrapper bakes anchored inputs first.
- `matrix`: lazy for geom3, but geom2 goes through `geom2/reverse` when the 2D determinant is negative; wrapper rebuilds geom2 frames. `lead` = count of leading non-geometry args.
- `keep`: returns new geometry in the same place; wrapper copies input frames onto the result. `lead` as above.
- `drop`: new geometry without frames; wrapper bakes inputs.
- `union`, `subtract`, `intersect`: replaced by the anchored booleans.

- [ ] **Step 1: Write `src/wrap/listFunctions.js`**

```js
'use strict'

const listFunctions = (node, prefix = '', out = []) => {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') out.push({ path, fn: value })
    else if (value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
      listFunctions(value, path, out)
    }
  }
  return out
}

module.exports = { listFunctions }
```

- [ ] **Step 2: Write the failing test `test/groups.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { listFunctions } = require('../src/wrap/listFunctions')
const { TABLE, PREFIXES, GROUPS, classify } = require('../src/wrap/groups')

test('every modeling function export is classified', () => {
  const missing = listFunctions(raw).map(({ path }) => path).filter((path) => !classify(path))
  assert.deepEqual(missing, [])
})

test('every table entry exists in modeling with the recorded arity', () => {
  const live = new Map(listFunctions(raw).map(({ path, fn }) => [path, fn.length]))
  const wrong = Object.entries(TABLE)
    .filter(([path, [, arity]]) => live.get(path) !== arity)
    .map(([path, [, arity]]) => `${path}: table ${arity}, modeling ${live.get(path)}`)
  assert.deepEqual(wrong, [])
})

test('every prefix matches at least one export', () => {
  const paths = listFunctions(raw).map(({ path }) => path)
  const unused = Object.keys(PREFIXES).filter((p) => !paths.some((path) => path.startsWith(`${p}.`)))
  assert.deepEqual(unused, [])
})

test('table groups are known and matrix/keep entries give lead', () => {
  for (const [path, [group, , lead]] of Object.entries(TABLE)) {
    assert.ok(GROUPS.includes(group), `${path}: unknown group ${group}`)
    if (group === 'matrix' || group === 'keep') assert.equal(typeof lead, 'number', `${path}: lead missing`)
  }
})

test('classify prefers exact entries and falls back to prefixes', () => {
  assert.deepEqual(classify('booleans.union'), { group: 'union', arity: 0, lead: 0 })
  assert.deepEqual(classify('transforms.mirror'), { group: 'matrix', arity: 1, lead: 1 })
  assert.equal(classify('maths.vec3.add').group, 'none')
  assert.equal(classify('nope.nothing'), undefined)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/wrap/groups'`.

- [ ] **Step 4: Write `src/wrap/groups.js`**

```js
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
  'colors.colorize': ['lazy', 1],
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
  'transforms.translate': ['lazy', 1],
  'transforms.translateX': ['lazy', 1],
  'transforms.translateY': ['lazy', 1],
  'transforms.translateZ': ['lazy', 1]
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
```

- [ ] **Step 5: Write `scripts/list-exports.js`** (prints what the table is missing or has wrong, ready to paste; exits 1 when anything is printed)

```js
#!/usr/bin/env node
'use strict'
const raw = require('@jscad/modeling')
const { listFunctions } = require('../src/wrap/listFunctions')
const { TABLE, classify } = require('../src/wrap/groups')

const live = listFunctions(raw)
const lines = []
for (const { path, fn } of live) {
  if (!classify(path)) lines.push(`  '${path}': ['UNCLASSIFIED', ${fn.length}],`)
  else if (TABLE[path] && TABLE[path][1] !== fn.length) lines.push(`  '${path}': ['${TABLE[path][0]}', ${fn.length}],  // arity was ${TABLE[path][1]}`)
}
const livePaths = new Set(live.map(({ path }) => path))
for (const path of Object.keys(TABLE)) if (!livePaths.has(path)) lines.push(`  // '${path}' no longer exported`)
if (lines.length) {
  console.log(lines.join('\n'))
  process.exitCode = 1
}
```

Add to `package.json` `scripts`: `"exports:check": "node scripts/list-exports.js"`.

- [ ] **Step 6: Run to verify**

Run: `npm test`
Expected: all tests PASS.
Run: `npm run exports:check`
Expected: no output, exit 0. If it prints entries, the live modeling differs from the table recorded in this plan: classify each printed function by reading its source in `../OpenJSCAD.org/packages/modeling/src` using the group definitions above, and report the additions in your task report.

- [ ] **Step 7: Commit**

```bash
git add src/wrap/listFunctions.js src/wrap/groups.js scripts/list-exports.js test/groups.test.js package.json
git commit -m "feat: grouping table for wrapped modeling exports"
```

### Task 7: Wrapped modeling

**Files:**
- Create: `src/wrap/index.js`, `test/wrap.test.js`, `test/chain.test.js`

**Model:** `opus` — the matrix and keep groups are the correctness core of the package; failures here need diagnosis, not transcription.

**Interfaces:**
- Consumes: `classify` (`src/wrap/groups.js`); `bakeAll`, `basisOf`, `worldFrames`, `withWorldFrames` (`src/storage.js`); `transformFrame`, `mapFrames` (`src/frame.js`); `unionAnchored`, `subtractAnchored`, `intersectAnchored` (`src/booleans.js`).
- Produces (`src/wrap/index.js`): `module.exports` is an object with the same namespace tree as `@jscad/modeling`, each function replaced per its group. Non-function values are copied.

Group behavior:
- `none`, `lazy`: the raw function itself (identity, so `m.maths.vec3.add === raw.maths.vec3.add`).
- `bake`: `bakeAll(args)`, then raw.
- `drop`: `bakeAll(args)`, raw, then for each result (array or single) whose `anchors.basis` does not match its basis, return a copy without `anchors`.
- `keep`: `bakeAll(args)`; `inputs = flatten(args.slice(lead))`; raw; for result `i`, carry `inputs[i]` world frames unchanged.
- `matrix`: `bakeAll(args)`; `inputs = flatten(args.slice(lead))`; raw; if no input is an anchored geom2, return raw result. Otherwise the matrix is `args[0]` for `geometries.geom2.transform`, else `fn(...args.slice(0, lead), path2.create()).transforms`; for result `i`, carry `inputs[i]` world frames through `transformFrame(matrix, f)`.
- carry rule: return `out` unchanged when `inputs[i]` has no anchors, `out` is not geom2/geom3, `out === inputs[i]`, or `out.anchors` exists and `out.anchors.basis === basisOf(out)`. Otherwise `withWorldFrames(out, mapped frames)`.
- `union`/`subtract`/`intersect`: `unionAnchored`/`subtractAnchored`/`intersectAnchored`.

- [ ] **Step 1: Write the failing test `test/wrap.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame, yOf } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../src/booleans')
const m = require('../src/wrap')

const { cuboid, rectangle } = raw.primitives
const p = frame([1, 0, 0], [1, 0, 0], [0, 1, 0])
const cube = () => m.transforms.translate([3, 0, 0], withAnchors(cuboid({ size: [2, 2, 2] }), { p }))
const square = () => m.transforms.translate([3, 0, 0], withAnchors(rectangle({ size: [2, 2] }), { p }))

const expectP = (g, origin, z, x) => {
  const f = worldFrames(g).p
  close(f.origin, origin)
  close(f.z, z)
  close(f.x, x)
}

test('none and lazy functions are the raw functions', () => {
  assert.equal(m.maths.vec3.add, raw.maths.vec3.add)
  assert.equal(m.transforms.translate, raw.transforms.translate)
  assert.equal(m.primitives.cuboid, raw.primitives.cuboid)
})

test('booleans are the anchored booleans', () => {
  assert.equal(m.booleans.union, unionAnchored)
  assert.equal(m.booleans.subtract, subtractAnchored)
  assert.equal(m.booleans.intersect, intersectAnchored)
})

test('lazy: translate and colorize carry frames', () => {
  expectP(m.colors.colorize([1, 0, 0], cube()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('bake: measureBoundingBox leaves frames readable', () => {
  const g = cube()
  close(m.measurements.measureBoundingBox(g)[1], [4, 1, 1])
  expectP(g, [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('bake: center moves frames with the geometry', () => {
  expectP(m.transforms.center({}, cube()), [1, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('matrix: geom3 mirror stays lazy and correct', () => {
  expectP(m.transforms.mirrorX(cube()), [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('matrix: geom2 mirrorX keeps frames, right-handed', () => {
  const g = m.transforms.mirrorX(square())
  expectP(g, [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
  close(yOf(worldFrames(g).p), [0, 0, -1])
  const [min, max] = m.measurements.measureBoundingBox(g)
  close([min[0], max[0]], [-5, -3])
})

test('matrix: geom2 scale with a negative factor', () => {
  expectP(m.transforms.scale([-1, 1, 1], square()), [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('matrix: geom2 rotateX(pi) goes through reverse', () => {
  expectP(m.transforms.rotateX(Math.PI, square()), [4, 0, 0], [1, 0, 0], [0, -1, 0])
})

test('matrix: geometries.geom2.transform with a mirror matrix', () => {
  const mirror = raw.maths.mat4.fromScaling(raw.maths.mat4.create(), [-1, 1, 1])
  expectP(m.geometries.geom2.transform(mirror, square()), [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('matrix: arrays keep frames per item', () => {
  const [a, b] = m.transforms.mirrorX([square(), cube()])
  expectP(a, [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
  expectP(b, [-4, 0, 0], [-1, 0, 0], [0, 1, 0])
})

test('keep: generalize, retessellate, invert, reverse', () => {
  const generalized = m.modifiers.generalize({ triangulate: true }, cube())
  expectP(generalized, [4, 0, 0], [1, 0, 0], [0, 1, 0])
  assert.equal(generalized.anchors.basis, generalized.polygons)
  expectP(m.modifiers.retessellate(cube()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
  expectP(m.geometries.geom3.invert(cube()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
  expectP(m.geometries.geom2.reverse(square()), [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('drop: hull result has no frames and the input stays readable', () => {
  const g = cube()
  const h = m.hulls.hull(g, m.transforms.translate([10, 0, 0], cuboid()))
  assert.equal(h.anchors, undefined)
  expectP(g, [4, 0, 0], [1, 0, 0], [0, 1, 0])
})

test('bake: toPolygons through the wrapper then raw measure is safe', () => {
  const g = cube()
  m.geometries.geom3.toPolygons(g)
  raw.measurements.measureBoundingBox(g)
  frameClose(worldFrames(g).p, frame([4, 0, 0], [1, 0, 0], [0, 1, 0]))
})
```

- [ ] **Step 2: Write the failing test `test/chain.test.js`**

Random transform chains with bakes at random points, compared against transforming the frame directly by the product of each op's matrix. The matrix of each op comes from applying the same raw op to an empty `path2`, whose transforms stay lazy.

```js
'use strict'
const test = require('node:test')
const raw = require('@jscad/modeling')
const { frameClose } = require('./helpers')
const { frame, transformFrame } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const m = require('../src/wrap')

const { mat4 } = raw.maths

const rng = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const ops = (r) => {
  const between = (lo, hi) => lo + (hi - lo) * r()
  const unit = () => {
    const v = [between(-1, 1), between(-1, 1), between(-1, 1)]
    const len = Math.hypot(...v) || 1
    return v.map((c) => c / len)
  }
  const sign = () => (r() < 0.5 ? -1 : 1)
  return [
    () => ['translate', [[between(-10, 10), between(-10, 10), between(-10, 10)]]],
    () => ['rotate', [[between(-Math.PI, Math.PI), between(-Math.PI, Math.PI), between(-Math.PI, Math.PI)]]],
    () => ['rotateX', [Math.PI]],
    () => ['scale', [[sign() * between(0.8, 1.25), sign() * between(0.8, 1.25), sign() * between(0.8, 1.25)]]],
    () => ['mirror', [{ origin: [between(-5, 5), between(-5, 5), between(-5, 5)], normal: unit() }]]
  ]
}

const bakes = [
  (g) => m.measurements.measureBoundingBox(g),
  (g) => (raw.geometries.geom3.isA(g) ? m.geometries.geom3.toPolygons(g) : m.geometries.geom2.toSides(g))
]

const runChain = (seed, shape, f0) => {
  const r = rng(seed)
  const choices = ops(r)
  let g = withAnchors(shape, { p: f0 })
  let total = mat4.create()
  for (let step = 0; step < 12; step++) {
    if (r() < 0.3) bakes[Math.floor(r() * bakes.length)](g)
    const [name, lead] = choices[Math.floor(r() * choices.length)]()
    const matrix = raw.transforms[name](...lead, raw.geometries.path2.create()).transforms
    g = m.transforms[name](...lead, g)
    total = mat4.multiply(mat4.create(), matrix, total)
    frameClose(worldFrames(g).p, transformFrame(total, f0), 1e-4)
  }
}

test('geom3 frames survive random transform chains with bakes', () => {
  for (let seed = 1; seed <= 40; seed++) {
    runChain(seed, raw.primitives.cuboid({ size: [2, 3, 4] }), frame([1, 2, 3], [0, 0, 1], [1, 0, 0]))
  }
})

test('geom2 frames survive random transform chains with bakes', () => {
  for (let seed = 1; seed <= 40; seed++) {
    runChain(seed, raw.primitives.rectangle({ size: [2, 3] }), frame([1, 0.5, 0], [1, 0, 0], [0, 1, 0]))
  }
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/wrap'`.

- [ ] **Step 4: Write `src/wrap/index.js`**

```js
'use strict'
const raw = require('@jscad/modeling')
const { classify } = require('./groups')
const { bakeAll, basisOf, worldFrames, withWorldFrames } = require('../storage')
const { transformFrame, mapFrames } = require('../frame')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('../booleans')

const { flatten } = raw.utils
const { geom2, path2 } = raw.geometries

const mapResults = (result, fn) => (Array.isArray(result) ? result.map(fn) : fn(result, 0))

const inSync = (out) => out.anchors && out.anchors.basis === basisOf(out)

const carry = (input, out, fn) => {
  if (!input || !input.anchors || !out || basisOf(out) === undefined || out === input || inSync(out)) return out
  return withWorldFrames(out, mapFrames(worldFrames(input), fn))
}

const stripStale = (out) => {
  if (!out || !out.anchors || inSync(out)) return out
  const { anchors, ...rest } = out
  return rest
}

const WRAPPERS = {
  none: (fn) => fn,
  lazy: (fn) => fn,
  bake: (fn) => (...args) => {
    bakeAll(args)
    return fn(...args)
  },
  drop: (fn) => (...args) => {
    bakeAll(args)
    return mapResults(fn(...args), stripStale)
  },
  keep: (fn, { lead }) => (...args) => {
    bakeAll(args)
    const inputs = flatten(args.slice(lead))
    return mapResults(fn(...args), (out, i) => carry(inputs[i], out, (f) => f))
  },
  matrix: (fn, { path, lead }) => (...args) => {
    bakeAll(args)
    const inputs = flatten(args.slice(lead))
    const result = fn(...args)
    if (!inputs.some((g) => geom2.isA(g) && g.anchors)) return result
    const matrix = path === 'geometries.geom2.transform'
      ? args[0]
      : fn(...args.slice(0, lead), path2.create()).transforms
    return mapResults(result, (out, i) => carry(inputs[i], out, (f) => transformFrame(matrix, f)))
  },
  union: () => unionAnchored,
  subtract: () => subtractAnchored,
  intersect: () => intersectAnchored
}

const wrapTree = (node, prefix) => {
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') {
      const entry = classify(path)
      out[key] = entry ? WRAPPERS[entry.group](value, { path, ...entry }) : value
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
      out[key] = wrapTree(value, path)
    } else {
      out[key] = value
    }
  }
  return out
}

module.exports = wrapTree(raw, '')
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: all tests PASS. If a chain test fails, print the seed, step, op name, and both frames before changing tolerances; a failure at 1e-4 is a real bug, not rounding (all math is double precision).

- [ ] **Step 6: Commit**

```bash
git add src/wrap/index.js test/wrap.test.js test/chain.test.js
git commit -m "feat: wrap modeling so frames survive in-place bakes and geom2 reversal"
```

### Task 8: attach and alignTo

**Files:**
- Create: `src/place.js`, `test/place.test.js`

**Model:** `sonnet` — code given.

**Interfaces:**
- Consumes: wrapped modeling (`src/wrap/index.js`); `anchor` (`src/lookup.js`); `frameToMat4` (`src/frame.js`); `canonicalName`, `parseDirection` (`src/names.js`).
- Produces (`src/place.js`):
  - `attach(child, childAnchor, parent, parentAnchor, { overlap = 0, flip = true, spin = 0 } = {}) → child transformed` by `M = P · T(0,0,-overlap) · Rx(π if flip) · Rz(spin) · C⁻¹`, applied with wrapped `transforms.transform`.
  - `alignTo(child, parent, direction, { inset = 0, inside = false } = {}) → child translated`. Per axis with `d ≠ 0`: outside puts the child's near face on the parent's face; inside puts the child's same-side face on it; `inset` moves the child toward the parent's center. Axes with `d = 0` center the child on the parent.

- [ ] **Step 1: Write the failing test `test/place.test.js`**

```js
'use strict'
const test = require('node:test')
const raw = require('@jscad/modeling')
const { close, frameClose } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors, worldFrames } = require('../src/storage')
const { anchor } = require('../src/lookup')
const { fromConnector, toConnector } = require('../src/convert')
const { attach, alignTo } = require('../src/place')
const m = require('../src/wrap')

const { cuboid, rectangle } = raw.primitives
const range = (g, axis) => {
  const [min, max] = m.measurements.measureBoundingBox(g)
  return [min[axis], max[axis]]
}
const A = () => cuboid({ size: [10, 10, 10] })
const B = () => cuboid({ size: [4, 4, 4] })

test('attach bottom to top stacks face to face', () => {
  const r = attach(B(), 'bottom', A(), 'top')
  close(range(r, 2), [5, 9])
  close(range(r, 0), [-2, 2])
  const f = anchor(r, 'bottom')
  close(f.origin, [0, 0, 5])
  close(f.z, [0, 0, -1])
})

test('attach overlap moves the child into the parent', () => {
  close(range(attach(B(), 'bottom', A(), 'top', { overlap: 1 }), 2), [4, 8])
})

test('attach flip false makes z axes equal', () => {
  close(range(attach(B(), 'top', A(), 'top', { flip: false }), 2), [1, 5])
})

test('attach spin rotates the child about its frame z', () => {
  const child = withAnchors(B(), { f: frame([0, 0, -2], [0, 0, -1], [1, 0, 0]) })
  const f = worldFrames(attach(child, 'f', A(), 'top', { spin: Math.PI / 2 })).f
  close(f.origin, [0, 0, 5])
  close(f.z, [0, 0, -1])
  close(f.x, [0, -1, 0])
})

test('parent frame round trips through toConnector', () => {
  const f = anchor(A(), 'top')
  frameClose(fromConnector(toConnector(f)), f)
})

test('attach works for geom2, including the reversing rotation', () => {
  const r = attach(rectangle({ size: [2, 2] }), 'left', rectangle({ size: [10, 10] }), 'right')
  close(range(r, 0), [5, 7])
  close(range(r, 1), [-1, 1])
  close(anchor(r, 'left').origin, [5, 0, 0])
})

test('alignTo top outside, centered on other axes', () => {
  const r = alignTo(cuboid({ size: [2, 2, 2] }), A(), 'top')
  close(range(r, 2), [5, 7])
  close(range(r, 0), [-1, 1])
})

test('alignTo top inside', () => {
  close(range(alignTo(cuboid({ size: [2, 2, 2] }), A(), 'top', { inside: true }), 2), [3, 5])
})

test('alignTo edge inside with inset', () => {
  const r = alignTo(cuboid({ size: [2, 2, 2] }), A(), 'top+right', { inside: true, inset: 1 })
  close(range(r, 0), [2, 4])
  close(range(r, 2), [2, 4])
  close(range(r, 1), [-1, 1])
})

test('alignTo accepts a vector and carries frames', () => {
  const child = withAnchors(cuboid({ size: [2, 2, 2] }), { p: frame([0, 0, 0], [0, 0, 1]) })
  const r = alignTo(child, A(), [0, -1, 0])
  close(range(r, 1), [-7, -5])
  close(worldFrames(r).p.origin, [0, -6, 0])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/place'`.

- [ ] **Step 3: Write `src/place.js`**

```js
'use strict'
const m = require('./wrap')
const { anchor } = require('./lookup')
const { frameToMat4 } = require('./frame')
const { canonicalName, parseDirection } = require('./names')

const { mat4 } = m.maths
const multiply = (...matrices) => matrices.reduce((a, b) => mat4.multiply(mat4.create(), a, b))

const attach = (child, childAnchor, parent, parentAnchor, { overlap = 0, flip = true, spin = 0 } = {}) => {
  const P = frameToMat4(anchor(parent, parentAnchor))
  const C = frameToMat4(anchor(child, childAnchor))
  const M = multiply(
    P,
    mat4.fromTranslation(mat4.create(), [0, 0, -overlap]),
    flip ? mat4.fromXRotation(mat4.create(), Math.PI) : mat4.create(),
    mat4.fromZRotation(mat4.create(), spin),
    mat4.invert(mat4.create(), C)
  )
  return m.transforms.transform(M, child)
}

const alignTo = (child, parent, direction, { inset = 0, inside = false } = {}) => {
  const d = parseDirection(canonicalName(direction))
  if (!d) throw new Error(`alignTo: not a direction: ${direction}`)
  const [cmin, cmax] = m.measurements.measureBoundingBox(child)
  const [pmin, pmax] = m.measurements.measureBoundingBox(parent)
  const offset = [0, 1, 2].map((i) => {
    if (d[i] === 0) return (pmin[i] + pmax[i]) / 2 - (cmin[i] + cmax[i]) / 2
    if (d[i] > 0) return pmax[i] - inset - (inside ? cmax[i] : cmin[i])
    return pmin[i] + inset - (inside ? cmin[i] : cmax[i])
  })
  return m.transforms.translate(offset, child)
}

module.exports = { attach, alignTo }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/place.js test/place.test.js
git commit -m "feat: attach by frames and alignTo bounding boxes"
```

### Task 9: anchorArrows, public entry point, and types

**Files:**
- Create: `src/debug.js`, `src/index.js`, `src/index.d.ts`, `tsconfig.json`, `test/debug.test.js`, `test/index.test.js`, `test/types.test-d.ts`
- Modify: `package.json` (typescript devDependency, `types` script)

**Model:** `sonnet` — code given; TypeScript errors may need judgment.

**Interfaces:**
- Consumes: everything above.
- Produces (`src/debug.js`): `anchorArrows(geometry, { length = 5 } = {}) → geom3[]`, one per anchor (27 defaults overlaid by explicit frames), each arrow a raw geom3 in world space with a `name` field. Arrow: shaft along frame `z` of `0.75·length`, cone head of `0.25·length`, a short bar of `0.4·length` along frame `x`.
- Produces (`src/index.js`): wrapped modeling namespaces plus `anchors`, a function `anchors(geometry) → worldFrames` with properties `frame, withAnchors, anchor, attach, alignTo, unionAnchored, subtractAnchored, intersectAnchored, anchorArrows, fromBosl2, fromConnector, toConnector`.

- [ ] **Step 1: Write the failing tests**

`test/debug.test.js`:
```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')
const { close } = require('./helpers')
const { frame } = require('../src/frame')
const { withAnchors } = require('../src/storage')
const { anchorArrows } = require('../src/debug')

const { cuboid } = raw.primitives

test('one arrow per anchor, explicit plus defaults', () => {
  assert.equal(anchorArrows(withAnchors(cuboid(), { bolt: frame([0, 0, 0], [1, 0, 0]) })).length, 28)
  assert.equal(anchorArrows(withAnchors(cuboid(), { top: frame([0, 0, 1], [0, 0, 1]) })).length, 27)
})

test('arrows are geom3 placed on their frames', () => {
  const arrows = anchorArrows(cuboid({ size: [2, 2, 2] }), { length: 5 })
  assert.ok(arrows.every((a) => raw.geometries.geom3.isA(a)))
  const top = arrows.find((a) => a.name === 'top')
  const [min, max] = raw.measurements.measureBoundingBox(top)
  close([max[2]], [6], 1e-6)
  close([max[0]], [2], 1e-6)
  assert.ok(min[2] > 0.8)
})
```

`test/index.test.js`:
```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { close } = require('./helpers')
const jscad = require('../src')

const { primitives, booleans, transforms, anchors } = jscad

test('re-exports modeling namespaces', () => {
  for (const ns of ['colors', 'curves', 'geometries', 'maths', 'measurements', 'primitives', 'text', 'utils',
    'booleans', 'expansions', 'extrusions', 'hulls', 'minkowski', 'modifiers', 'transforms']) {
    assert.equal(typeof jscad[ns], 'object', ns)
  }
  assert.equal(booleans.union, anchors.unionAnchored)
})

test('anchors is a function with the API as properties', () => {
  for (const name of ['frame', 'withAnchors', 'anchor', 'attach', 'alignTo', 'unionAnchored', 'subtractAnchored',
    'intersectAnchored', 'anchorArrows', 'fromBosl2', 'fromConnector', 'toConnector']) {
    assert.equal(typeof anchors[name], 'function', name)
  }
})

test('a bolt placed through a carried hole lines up', () => {
  const plate = transforms.translate([3, 4, 0], primitives.cuboid({ size: [20, 20, 2] }))
  const cutter = transforms.translate([5, 0, 0], anchors.withAnchors(
    primitives.cylinder({ radius: 1, height: 4 }),
    { axis: anchors.frame([0, 0, 0], [0, 0, 1]) }))
  const holed = booleans.subtract(plate, cutter, { carry: { bolt1: cutter } })
  const bolt = anchors.withAnchors(primitives.cylinder({ radius: 0.9, height: 10 }), { tip: anchors.frame([0, 0, -5], [0, 0, -1]) })
  const placed = anchors.attach(bolt, 'tip', holed, 'bolt1.axis', { flip: false })
  close(anchors(placed).tip.origin, [5, 0, 0])
  close(anchors(placed).tip.z, [0, 0, 1])
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/debug'` and `'../src'`.

- [ ] **Step 3: Write `src/debug.js`**

```js
'use strict'
const { booleans, primitives, transforms } = require('@jscad/modeling')
const { frameToMat4 } = require('./frame')
const { worldFrames } = require('./storage')
const { defaultFrames } = require('./defaults')

const arrow = (name, f, length) => {
  const r = length / 20
  const shaft = primitives.cylinder({ radius: r, height: length * 0.75, center: [0, 0, length * 0.375], segments: 12 })
  const head = primitives.cylinderElliptic({
    height: length * 0.25, startRadius: [r * 2.5, r * 2.5], endRadius: [0, 0], center: [0, 0, length * 0.875], segments: 12
  })
  const bar = primitives.cuboid({ size: [length * 0.4, r, r], center: [length * 0.2, 0, 0] })
  const placed = transforms.transform(frameToMat4(f), booleans.union(shaft, head, bar))
  return Object.assign(placed, { name })
}

const anchorArrows = (geometry, { length = 5 } = {}) => {
  const frames = Object.assign({}, defaultFrames(geometry), worldFrames(geometry))
  return Object.entries(frames).map(([name, f]) => arrow(name, f, length))
}

module.exports = { anchorArrows }
```

If `cylinderElliptic` rejects a zero `endRadius`, use `endRadius: [r / 100, r / 100]`.

- [ ] **Step 4: Write `src/index.js`**

```js
'use strict'
const modeling = require('./wrap')
const { frame } = require('./frame')
const { withAnchors, worldFrames } = require('./storage')
const { anchor } = require('./lookup')
const { unionAnchored, subtractAnchored, intersectAnchored } = require('./booleans')
const { attach, alignTo } = require('./place')
const { anchorArrows } = require('./debug')
const { fromBosl2, fromConnector, toConnector } = require('./convert')

const anchors = Object.assign((geometry) => worldFrames(geometry), {
  frame,
  withAnchors,
  anchor,
  attach,
  alignTo,
  unionAnchored,
  subtractAnchored,
  intersectAnchored,
  anchorArrows,
  fromBosl2,
  fromConnector,
  toConnector
})

module.exports = Object.assign({}, modeling, { anchors })
```

- [ ] **Step 5: Run to verify the JS tests pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Add TypeScript and the type test**

Run: `npm install --save-dev typescript@^5.3.2`

Add to `package.json` `scripts`: `"types": "tsc -p tsconfig.json"`.

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": []
  },
  "files": ["test/types.test-d.ts"]
}
```

`test/types.test-d.ts`:
```ts
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

// @ts-expect-error spin must be a number
anchors.attach(cyl, 'axis', holed, 'top', { spin: '90' })

export { f, byVector, frames, merged, cut, arrows, name, converted, c }
```

- [ ] **Step 7: Run the type check to verify it fails**

Run: `npm run types`
Expected: FAIL, cannot find a declaration for `'../src'` or missing exported members.

- [ ] **Step 8: Write `src/index.d.ts`**

```ts
import type { Geom2, Geom3 } from '@jscad/modeling/src/geometries/types'

export * from '@jscad/modeling'

export type Vec3 = [number, number, number]

export interface Frame {
  readonly origin: Readonly<Vec3>
  readonly z: Readonly<Vec3>
  readonly x: Readonly<Vec3>
}

export type Frames = { readonly [name: string]: Frame }
export type Anchorable = Geom2 | Geom3
export type AnchorRef = string | number[]

export interface AttachOptions { overlap?: number, flip?: boolean, spin?: number }
export interface AlignOptions { inset?: number, inside?: boolean }
export interface SubtractOptions { carry?: { [prefix: string]: Anchorable } }
export interface ArrowOptions { length?: number }
export interface Connector { point: number[], axis: number[], normal: number[] }
export type Bosl2Anchor = [string, number[], number[], number?, ...unknown[]]

type Operands<T> = Array<T | T[]>

export interface AnchorsApi {
  (geometry: Anchorable): Frames
  frame(origin: number[], z: number[], x?: number[]): Frame
  withAnchors<T extends Anchorable>(geometry: T, frames: { [name: string]: Frame }): T
  anchor(geometry: Anchorable, ref: AnchorRef): Frame
  attach<T extends Anchorable>(child: T, childAnchor: AnchorRef, parent: Anchorable, parentAnchor: AnchorRef, options?: AttachOptions): T
  alignTo<T extends Anchorable>(child: T, parent: Anchorable, direction: AnchorRef, options?: AlignOptions): T
  unionAnchored<T extends Anchorable>(...geometries: Operands<T>): T
  subtractAnchored<T extends Anchorable>(...args: Array<T | T[] | SubtractOptions>): T
  intersectAnchored<T extends Anchorable>(...geometries: Operands<T>): T
  anchorArrows(geometry: Anchorable, options?: ArrowOptions): Geom3[]
  fromBosl2(anchor: Bosl2Anchor): [string, Frame]
  fromConnector(connector: Connector): Frame
  toConnector(frame: Frame): Connector
}

export declare const anchors: AnchorsApi
```

The JS `booleans.subtract` accepts `{ carry }`, but modeling's own `.d.ts` for `booleans.subtract` does not; `test/types.test-d.ts` therefore uses `anchors.subtractAnchored` for carry. Do not change modeling's types.

- [ ] **Step 9: Run type check and tests**

Run: `npm run types`
Expected: exit 0, no output.
Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/debug.js src/index.js src/index.d.ts tsconfig.json test/debug.test.js test/index.test.js test/types.test-d.ts package.json package-lock.json
git commit -m "feat: anchorArrows, public entry point, and type declarations"
```

### Task 10: Documentation and backlog

**Files:**
- Modify: `README.md`
- Create: `docs/quickstart.md`, `docs/user-manual.md`, `docs/install.md`, `docs/architecture.md`, `docs/development.md`, `docs/backlog.md`

**Model:** `sonnet` — prose written from the spec and the code.

**Interfaces:**
- Consumes: the whole package as built; `docs/design/anchors.md`.

Follow the user's documentation rules: plain words, no filler, no marketing words, no section that announces its own topic, exact values kept. Every code example must run against the package as built; check each one with `node -e` from the repo root before committing.

- [ ] **Step 1: `README.md`**

Keep it short: what the package is and who it is for (native `@jscad/modeling` models, jscad-fluent, the jscadui OpenSCAD transpiler), one example (the plate/cutter/bolt example from `test/index.test.js`, written with `require('@jbroll/jscad-anchors')`), an install line (`npm install @jbroll/jscad-anchors`, with `@jscad/modeling` as a peer), and links to each file in `docs/`. Replace "Status: design only" with the version `0.1.0`.

- [ ] **Step 2: `docs/quickstart.md`**

Shortest path to one result: sibling checkout layout (`../OpenJSCAD.org` on `fork-main`), `npm install`, a 15-line model that attaches one cuboid on top of another by `bottom`/`top` and prints the placed part's `bottom` frame. State the printed output.

- [ ] **Step 3: `docs/user-manual.md`**

Every export and behavior:
- Frames: the value shape, orthogonalization, the spin-0 reference when `x` is missing or parallel, `y = cross(z, x)`, immutability, radians.
- Names: direction words and aliases (`up`, `down`, `bot`, `fwd`, `forward`), canonical z-y-x order, vectors with components in -1/0/1, `center`.
- `withAnchors` (local space of the geometry, merges, geom2/geom3 only), `anchors(geometry)`, `anchor(geometry, ref)` with explicit-then-default lookup and the unknown-anchor error.
- Default anchors: bounding-box rule, the `x`/`y` orientation rule from Task 4, the cuboid-only match with BOSL2.
- `attach` with the matrix formula and each option; `alignTo` with outside/inside/inset per axis and centering on zero axes.
- `unionAnchored`, `subtractAnchored` with `carry` (explicit frames only, `prefix.name`), `intersectAnchored`; arrays flatten in order; the same rules apply to `booleans.union/subtract/intersect` imported from this package.
- Wrapped modeling: import from `@jbroll/jscad-anchors`; which operations keep, move, or drop frames (lazy, bake, matrix, keep, drop groups in user terms); hull, extrusions, expansions, minkowski, scission drop frames.
- The raw-bake error text and what causes it.
- Non-uniform scale: `z` and `x` transform as directions and are renormalized, so a face normal on a sheared face is not recomputed.
- `anchorArrows`, `fromBosl2` (degrees; returns `[name, frame]`), `fromConnector`, `toConnector`.

- [ ] **Step 4: `docs/install.md`**

Node 22 (tests use `node --test` globs), peer `@jscad/modeling >=2.12.0 <3`, local development link `file:../OpenJSCAD.org/packages/modeling`, consumer npm `overrides` so transitive `@jscad/*` use one modeling copy (from spec "Verified behavior this relies on"), TypeScript declarations in `src/index.d.ts`.

- [ ] **Step 5: `docs/architecture.md`**

Fold the design decisions from `docs/design/anchors.md` so the spec can be deleted:
- Module map: `frame`, `names`, `convert`, `storage`, `defaults`, `lookup`, `booleans`, `wrap/` (`groups`, `listFunctions`, `index`), `place`, `debug`, `index`, and the dependency direction (core uses raw modeling; `place`/`debug`/`index` use the wrapper).
- Storage and the basis check; why in-place baking breaks naive storage (the `translate` then `measureBoundingBox` example); the modeling file references the spec verified.
- The wrapper decision and the four rejected alternatives with their reasons (field hook in modeling, monkey patching, accessors, matrix recovery).
- The group table, how `npm run exports:check` and `test/groups.test.js` keep it in step with modeling, and the geom2 2D-determinant reverse case (including rotations such as `rotateX(π)`).
- BOSL2 reference rules actually implemented (spin-0 reference from `affine3d_rot_from_to`; cuboid spin hints from `_compute_spin`), resolving spec open question 1.
- Boolean rules and the union first-wins decision (spec open question 4, kept as JSCAD v1's rule).
- `attach` math and why `connectors/transformationBetween.js` is not reused.
- Consumers: jscad-fluent, transpiler, jscad-ai-studio integration design from the spec sections of those names, in short form.
- JSCAD v3 notes from the spec section "JSCAD v3".
- Where the package lives and the rejected locations.
- Remaining open questions: extrusion caps (2), eager vs lazy BOSL2 resolution (3), serializers and `format-jscad` ignoring `anchors` (5), upstream field hook (6).

- [ ] **Step 6: `docs/development.md`**

Repo layout, `npm install`, `npm test`, `npm run types`, `npm run exports:check` and how to classify a new export, test file map, commit conventions. No release process beyond `npm publish` from a clean tree.

- [ ] **Step 7: `docs/backlog.md`**

Items, each with enough detail to grow into a spec (copy the relevant specifics from the spec):
- jscad-fluent: `.withAnchors/.anchor/.anchors/.attachTo/.alignTo`, booleans through the anchored versions with `{ carry }`, geom2/path2 where meaningful, generated methods import from `@jbroll/jscad-anchors`, dependency declared as peer plus `file:../jscad-anchors`.
- Transpiler (jscadui): special-case `attachable`, resolve anchors with transpiled `_find_anchor` and `fromBosl2`, store frames before `multmatrix`, emit anchored booleans, generated code and `openscad-runtime` import modeling through this package.
- BOSL2 cross-check test: compare `fromBosl2` and default anchors against `_find_anchor` for cuboid, cylinder, sphere through the transpiler (spec Testing section; not built here because it needs jscadui).
- jscad-ai-studio: `jscad-work measure --anchors`, `verify-spec` anchor assertions (example JSON from the spec), load modeling through this package, replace the "Hole alignment across parts" item, teach `attach`/`carry` in `skills/jscad-assembly`.
- `anchorArrows` viewer screenshot test (belongs with a viewer).
- Frames through hull, extrusions, expand, offset; extrusion cap rule.
- JSCAD v3 port: `basisOf` to `outlines`, regenerate the table from flat exports, ESM, bounding-box cache check.
- Check serializers and `format-jscad` ignore `anchors`.
- Offer the field hook upstream; submit `2e81bb3a` as a bug report.

- [ ] **Step 8: Verify examples and commit**

Run each README and quickstart example with `node -e` from the repo root (use `require('./src')` in place of `require('@jbroll/jscad-anchors')` for the check only).
Run: `npm test`
Expected: all tests PASS.

```bash
git add README.md docs/quickstart.md docs/user-manual.md docs/install.md docs/architecture.md docs/development.md docs/backlog.md
git commit -m "docs: user manual, architecture, install, development, backlog"
```

### Final step (controller, after the whole-branch review)

Delete `docs/design/anchors.md` and this plan in one commit once `docs/architecture.md` and `docs/backlog.md` carry their content:

```bash
git rm docs/design/anchors.md docs/superpowers/plans/2026-09-14-anchors-package.md
git commit -m "docs: remove working spec and plan"
```

Do not merge, push, or open a PR.

