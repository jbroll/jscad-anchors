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
