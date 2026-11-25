import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const react = {
  Component: class Component { constructor(props) { this.props = props } setState(next) { this.state = typeof next === 'function' ? next(this.state) : next } },
  createContext: (initial) => { const ctx = { value: initial }; ctx.Provider = ({ value, children }) => { ctx.value = value; return children }; return ctx },
  useContext: ctx => ctx.value, useId: () => 'dv-id',
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
  useState: initial => [initial, () => {}], useEffect: () => {}, useRef: current => ({ current }),
  useLayoutEffect: () => {}, useMemo: make => make(), useCallback: fn => fn, Fragment: 'fragment',
}
const require = (name) => {
  const platform = { react, 'react-dom': { createPortal: node => node }, '@deepseek-ai/dsh-client-ui-primitives': { MarkdownText: () => null } }
  if (!(name in platform)) throw new Error(`no platform module ${name}`)
  return platform[name]
}
const bundled = async (entry) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(`../src/client/${entry}`, import.meta.url))],
    bundle: true, format: 'cjs', platform: 'node', write: false,
    external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  })
  const module = { exports: {} }
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require, setTimeout, clearTimeout, URL, URLSearchParams })
  return module.exports
}

// Only cells.js is needed: the words a step is shown in.
const cells = await bundled('cells.js')
const { stepWords } = cells

test('a step is shown in words a person reads, not the tool name', () => {
  assert.equal(stepWords('pwsh'), 'Running shell commands')
  assert.equal(stepWords('read'), 'Opening a file')
  assert.equal(stepWords('web_search'), 'Searching online')
  assert.equal(stepWords('write'), 'Writing changes')
  assert.equal(stepWords('create_group'), 'Creating a group')
})

test('a tool no phrase covers is shown as its own name rather than nothing', () => {
  assert.equal(stepWords('something_new'), 'something_new')
})
