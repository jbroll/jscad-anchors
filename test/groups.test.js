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
