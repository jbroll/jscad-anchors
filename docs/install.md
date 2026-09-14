# Install

## Requirements

- Node 22. Tests run with `node --test` against glob patterns
  (`test/**/*.test.js`), which Node's test runner resolves natively.
- `@jscad/modeling` `>=2.12.0 <3` as a peer dependency. This package does not
  install its own copy; the consumer's `@jscad/modeling` is used.

## Consumer setup

```
npm install @jbroll/jscad-anchors
```

Because several other packages in this ecosystem (jscad-fluent, the jscadui
transpiler, jscad-ai-studio) also depend on `@jscad/modeling`, a consumer
that uses more than one of them should force npm to install a single copy,
so `geometry.transforms`, `geometry.anchors`, and the identity checks this
package relies on are all comparing against the same module instance. Add an
`overrides` entry to the consuming project's `package.json`:

```json
{
  "overrides": {
    "@jscad/modeling": "<the resolved version>"
  }
}
```

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
