'use strict'
const esbuild = require('esbuild')

// The viewer maps this name to the engine's modeling bundle, while @jscad/modeling maps to this build.
const modelingForAnchors = {
  name: 'modeling-for-anchors',
  setup (build) {
    build.onResolve({ filter: /^@jscad\/modeling$/ }, () => ({ path: '@jscad/modeling-for-anchors', external: true }))
  }
}

esbuild.build({
  entryPoints: ['src/browser.js'],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  outfile: 'dist/jscad-anchors.cjs',
  plugins: [modelingForAnchors],
  logLevel: 'info'
}).catch(() => process.exit(1))
