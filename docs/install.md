# Install

## Requirements

- Node 22. Tests run with `node --test` against glob patterns
  (`test/**/*.test.js`), which Node's test runner resolves natively.
- `@jscad/modeling` `>=2.12.0 <3` as a peer dependency. This package does not
  install its own copy; the consumer's `@jscad/modeling` is used.

The group table in `src/wrap/groups.js` was verified against modeling
`fork-main` 2.13.4. To check another installed version, run
`npm run exports:check`.

## Consumer setup

```
npm install @jbroll/jscad-anchors
```

jscadui, jscad-fluent, and jscad-ai-studio use one modeling package:
`packages/modeling` on the `fork-main` branch of
[jbroll/OpenJSCAD.org](https://github.com/jbroll/OpenJSCAD.org), published as
`@jbroll/jscad-modeling`. Consumers link it from a sibling checkout
(`../OpenJSCAD.org/packages/modeling`) and add npm `overrides` so transitive
`@jscad/*` dependencies, including this package's peer, resolve to the same
copy. Two copies would break the `polygons`/`sides` identity checks this
package relies on.

```json
{
  "dependencies": {
    "@jbroll/jscad-anchors": "file:../jscad-anchors",
    "@jscad/modeling": "file:../OpenJSCAD.org/packages/modeling"
  },
  "overrides": {
    "@jscad/modeling": "$@jscad/modeling"
  }
}
```

`$@jscad/modeling` makes every nested `@jscad/modeling` use the root
dependency's spec.

The package is CommonJS. ES modules can import it by name
(`import { anchors, booleans } from '@jbroll/jscad-anchors'`), because
`src/index.js` assigns `module.exports` an object literal that Node's
named-export detection can read.

## Local development

This package is developed against the `fork-main` branch of
[jbroll/OpenJSCAD.org](https://github.com/jbroll/OpenJSCAD.org), checked out
as a sibling directory and linked with `file:`:

```
../OpenJSCAD.org/packages/modeling
../jscad-anchors
```

`devDependencies` in `package.json` already points at
`file:../OpenJSCAD.org/packages/modeling`; `npm install` from this
repository picks it up as long as the sibling checkout exists.

## TypeScript

Type declarations ship in `src/index.d.ts` (referenced by `package.json`'s
`types` field) and re-export everything from `@jscad/modeling`'s own types
alongside this package's `Frame`, `Frames`, and the `anchors` API. `npm run
types` runs `tsc -p tsconfig.json` to check them.
