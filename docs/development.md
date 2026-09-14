# Development

## Repo layout

```
src/
  frame.js         frame algebra
  names.js         direction names and BOSL2 aliases
  convert.js       fromBosl2, fromConnector, toConnector
  storage.js       frame storage on geometry, baking, the basis check
  defaults.js      bounding-box default anchors
  lookup.js        anchors(), anchor()
  booleans.js      unionAnchored, subtractAnchored, intersectAnchored
  place.js         attach, alignTo
  debug.js         anchorArrows
  index.js         public entry point
  index.d.ts        TypeScript declarations
  wrap/
    groups.js       the function classification table
    listFunctions.js  walks a modeling-shaped tree, listing every function
    index.js        builds the wrapped modeling tree
scripts/
  list-exports.js  npm run exports:check
test/
  *.test.js
```

See `docs/architecture.md` for what each module is responsible for and how
they depend on each other.

## Setup

Requires a sibling checkout of the fork (`docs/install.md`):

```
../OpenJSCAD.org   # fork-main branch
../jscad-anchors    # this repository
```

```
npm install
```

## Commands

```
npm test              # node --test "test/**/*.test.js"
npm run types          # tsc -p tsconfig.json, checks src/index.d.ts
npm run exports:check  # scripts/list-exports.js, checks the wrap group table
```

`npm test` runs every `test/*.test.js` file with Node's built-in test
runner. There is no separate build step; `src/` is run directly.

### Classifying a new export

When `@jscad/modeling` adds or changes a geometry-taking export,
`npm run exports:check` and `test/groups.test.js` both fail. The check
prints one line per problem:

- `'path': ['UNCLASSIFIED', arity],` — add an entry to `TABLE` in
  `src/wrap/groups.js` with this line, then pick the right group (see
  `docs/architecture.md`'s "The group table" and `docs/user-manual.md`'s
  "Wrapped modeling" for what each group does) and, for `matrix` or `keep`,
  set `lead` to how many leading arguments come before the geometry operands.
- `'path': ['group', arity],  // arity was N` — the function's parameter
  count changed; update the arity in `TABLE`.
- `// 'path' no longer exported` — remove the `TABLE` entry.

A function that doesn't take geometry at all (or whose whole namespace never
does) can instead get a `PREFIXES` entry covering every function under that
path, rather than one `TABLE` entry each.

## Test file map

| File | Covers |
|---|---|
| `test/frame.test.js` | `frame`, orthogonalization, `spinReference`, `frameToMat4`/`mat4ToFrame`, `transformFrame`, `mapFrames` |
| `test/names.test.js` | Direction names, aliases, canonicalization |
| `test/convert.test.js` | `fromBosl2`, `fromConnector`, `toConnector` |
| `test/storage.test.js` | `basisOf`, `withAnchors`, `worldFrames`, baking, the baked-outside error |
| `test/defaults.test.js` | Default anchors from the bounding box, `yHint` |
| `test/lookup.test.js` | `anchors()`, `anchor()`, explicit-then-default, unknown-anchor error |
| `test/booleans.test.js` | `unionAnchored`, `subtractAnchored` (`carry`), `intersectAnchored` |
| `test/place.test.js` | `attach`, `alignTo` |
| `test/debug.test.js` | `anchorArrows` |
| `test/wrap.test.js` | Each wrap group (`lazy`, `bake`, `matrix`, `keep`, `drop`), booleans through the wrapper |
| `test/groups.test.js` | The `TABLE`/`PREFIXES` classification stays complete and in step with modeling |
| `test/chain.test.js` | Random transform chains with bakes inserted, geom2 and geom3, checked against directly transforming the frame |
| `test/index.test.js` | The public entry point's shape, and the plate/cutter/bolt example |
| `test/types.test-d.ts` | `src/index.d.ts`, checked by `npm run types` |

## Commit conventions

Conventional-commit-style subjects (`feat:`, `fix:`, `docs:`, ...), imperative
mood, one logical change per commit.

## Release

`npm publish` from a clean working tree. No further release process.
