import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A hook that sits after an early return in a component or hook runs on the renders that
// get past the return and not on the ones that do not. React counts a different number of
// hooks between those two renders, answers with error #310, and unmounts the slot the
// component was drawn in, which takes everything the slot held with it. That is how the
// chat's working row once removed the whole Bot layer of the page when a turn started.
//
// The scan reads the source rather than rendering, because the components take DSH's own
// hooks and slot services as props. It looks at top-level statements of a component body:
// a one-line `if (…) return` and a plain `return` at the body's own depth both count.
// A return inside a nested block or callback is not tracked, so the check is a lower bound.
const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)))

const STARTS = /^(?:export )?(?:async )?(?:function|const|let) ([A-Z]\w*|use[A-Z]\w*)\b/
const HOOK = /\b(use[A-Z]\w*)\s*\(/

export function hooksAfterReturn(source) {
  const found = []
  let name = null
  let depth = 0
  let returned = 0
  for (const [index, line] of source.split('\n').entries()) {
    const start = line.match(STARTS)
    if (start && depth === 0) { name = start[1]; returned = 0 }
    if (name === null) continue
    if (depth === 1 && /^ {2}(?:if \(.*\) )?return\b/.test(line)) { if (returned === 0) returned = index + 1 }
    else if (depth === 1 && returned > 0 && HOOK.test(line) && /^ {2}/.test(line)) {
      found.push({ line: index + 1, after: returned, fn: name, text: line.trim() })
      returned = 0
    }
    for (const char of line) {
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
    }
    if (depth <= 0) { name = null; depth = 0; returned = 0 }
  }
  return found
}

test('a hook after an early return is reported', () => {
  const sample = [
    'export function Row({ live }) {',
    '  const text = live.text',
    '  if (text === "") return null',
    '  const seen = useRef(0)',
    '  return text',
    '}',
  ].join('\n')
  assert.deepEqual(hooksAfterReturn(sample).map(hit => hit.fn), ['Row'])
})

test('a hook before the early return is not reported', () => {
  const sample = [
    'export function Row({ live }) {',
    '  const seen = useRef(0)',
    '  if (live.text === "") return null',
    '  return live.text',
    '}',
  ].join('\n')
  assert.deepEqual(hooksAfterReturn(sample), [])
})

test('no component in src/client calls a hook after an early return', () => {
  const dir = join(PLUGIN, 'src/client')
  const hits = readdirSync(dir).filter(name => name.endsWith('.js'))
    .flatMap(name => hooksAfterReturn(readFileSync(join(dir, name), 'utf8')).map(hit => ({ ...hit, file: name })))
  assert.deepEqual(hits.map(hit => `${hit.file}:${hit.line} in ${hit.fn} after ${hit.after}`), [])
})
