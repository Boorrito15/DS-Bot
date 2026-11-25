// The Server page: where the server is put down and brought back. A change that runs on the
// server only takes effect after a restart, and this is the button for it, so nobody has to
// remember a command or wait for someone else.
import { createElement as h, useState } from 'react'
import { t } from './i18n.js'

export function ServerPage({ actions, Section, Row }) {
  const [state, setState] = useState({ busy: false, done: false, error: '' })
  const restart = async () => {
    setState({ busy: true, done: false, error: '' })
    try {
      const answer = await actions.restartHost()
      if (answer?.error !== undefined) {
        setState({ busy: false, done: false, error: answer.error })
        return
      }
      setState({ busy: false, done: true, error: '' })
      // The page's connection ends with the server; it comes back on its own.
      setTimeout(() => { location.reload() }, 9000)
    } catch (error) {
      setState({ busy: false, done: false, error: error?.message ?? String(error) })
    }
  }
  return h('div', { className: 'bt-settings-form' },
    h(Section, { title: t('Server') },
      h(Row, {
        label: t('Restart the server'),
        hint: t('Takes effect for changes that run on the server. A reply that is being written is cut, and every open page reloads.'),
      },
      h('button', {
        type: 'button', className: 'bt-soft bt-soft-sm', disabled: state.busy || state.done,
        onClick: () => { void restart() },
      }, state.busy ? t('Restarting…') : t('Restart')))),
    state.done ? h('p', { className: 'bt-set-hint' }, t('Restarting. This page reloads when the server is back.')) : null,
    state.error === '' ? null : h('p', { className: 'bt-set-hint' }, state.error))
}
