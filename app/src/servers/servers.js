import { serversText } from './text.mjs'

// The list is drawn from what the main process answers; nothing here is trusted back to it,
// so every action carries an id or an address and the main process checks both again.
const api = window.dsBotServers
const $ = id => document.getElementById(id)

let state = { servers: [], currentUrl: null, lang: 'en' }
const say = key => serversText(state.lang, key)

function draw() {
  $('title').textContent = say('title')
  $('lead').textContent = say('lead')
  $('address-label').textContent = say('address')
  $('name-label').textContent = say('name')
  $('name').placeholder = say('nameHint')
  $('add-button').textContent = say('add')
  $('note').textContent = say('note')
  $('empty').textContent = say('empty')

  const list = $('list')
  list.replaceChildren()
  for (const server of state.servers) {
    const row = document.createElement('li')
    row.className = 'row'

    const text = document.createElement('div')
    text.className = 'text'
    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = server.name
    if (server.shown === state.currentUrl) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = say('current')
      name.append(badge)
    }
    const url = document.createElement('div')
    url.className = 'url'
    url.textContent = server.shown
    text.append(name, url)

    const connect = document.createElement('button')
    connect.className = 'btn primary'
    connect.type = 'button'
    connect.textContent = say('connect')
    connect.addEventListener('click', () => void api.connect(server.id))

    const remove = document.createElement('button')
    remove.className = 'btn link'
    remove.type = 'button'
    remove.textContent = say('remove')
    remove.addEventListener('click', () => void api.remove(server.id))

    row.append(text, connect, remove)
    list.append(row)
  }
  // While a server is open, the way back to this computer's own team sits under the list.
  $('local').hidden = state.currentUrl === null
  $('local').textContent = `${say('thisComputer')} — ${say('thisComputerNote')}`
  $('empty').hidden = state.servers.length > 0
  $('empty').textContent = state.servers.length > 0 ? '' : `${say('empty')} ${say('thisComputerNote')}`
}

async function refresh() {
  state = await api.state()
  draw()
}

$('add').addEventListener('submit', async (event) => {
  event.preventDefault()
  const url = $('url').value.trim()
  const name = $('name').value.trim()
  const error = $('error')
  error.hidden = true
  if (url === '') { error.textContent = say('badAddress'); error.hidden = false; return }
  const answer = await api.add({ url, name })
  if (answer?.error !== undefined) {
    error.textContent = answer.error
    error.hidden = false
    return
  }
  $('url').value = ''
  $('name').value = ''
  await refresh()
  $('url').focus()
})

$('local').addEventListener('click', () => void api.local())

// The page closes the window, so a connect that the main process refuses leaves the list up.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') void api.close()
})

await refresh()
