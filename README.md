# jscad-anchors

Named frames (anchors) on JSCAD geometry, so parts are placed by attaching one
part's frame to another's instead of by hand-computed transforms. Shared by
native `@jscad/modeling` models, [jscad-fluent](https://github.com/jbroll/jscad-fluent),
and the OpenSCAD transpiler in [jscadui](https://github.com/jbroll/jscadui).

Status: design only. See [`docs/design/anchors.md`](docs/design/anchors.md).

Requires the `jscad.transformField` hook in `@jscad/modeling`, carried on the
`fork-main` branch of [jbroll/OpenJSCAD.org](https://github.com/jbroll/OpenJSCAD.org).
