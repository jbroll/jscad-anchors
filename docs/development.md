# Development

Needs a sibling checkout of the modeling fork at `../OpenJSCAD.org` on `fork-main` (see `docs/install.md`). Module layout is in `docs/architecture.md`; tests are in `test/`, one file per module.

```
npm install
npm test               # node's built-in test runner; no build step
npm run types          # checks src/index.d.ts
npm run exports:check  # checks the wrapper's group table against modeling
```

When modeling adds, removes, or changes a function, `npm run exports:check` prints the table lines to add or fix in `src/wrap/groups.js`. The groups are described in `docs/architecture.md`.

Release with `npm publish` from a clean tree.
