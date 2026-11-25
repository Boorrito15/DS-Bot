// The Servers window: add, name and remove the computers this app can open, and pick one to
// connect to. It opens from the app's menu at any time, so it is small and separate from the
// start page, and the caller keeps the handle so a second click brings it forward instead.
import { addServer, readServers, removeServer, serversFile } from './servers.mjs'
import { shownRemoteUrl } from './remote-url.mjs'

const CHANNELS = ['state', 'add', 'remove', 'connect', 'local', 'close']

/**
 * Open the window. `onConnect(url)` runs when the user picks a server: the caller closes this
 * app into that address, so nothing is started or stopped here.
 * @param {{
 *   electron: any, page: string, preload: string, userData: string, icon?: string,
 *   currentUrl?: string, lang?: string, onConnect: (url: string) => void, onLocal: () => void,
 * }} options
 */
export function openServersWindow(options) {
  const { BrowserWindow, ipcMain, nativeTheme } = options.electron
  const file = serversFile(options.userData)

  const win = new BrowserWindow({
    width: 520, height: 620, useContentSize: true, resizable: true, minimizable: false,
    maximizable: false, fullscreenable: false, show: false, title: 'DS Bot', icon: options.icon,
    backgroundColor: nativeTheme?.shouldUseDarkColors ? '#14161a' : '#f6f7f9',
    webPreferences: {
      preload: options.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false,
    },
  })

  const drop = () => {
    for (const channel of CHANNELS) ipcMain.removeHandler(`ds-bot:servers-${channel}`)
  }
  const close = () => {
    drop()
    if (!win.isDestroyed()) win.close()
  }
  // Only this window's page may ask; a stray frame is refused rather than answered.
  const answer = handler => (event, payload) => {
    if (event.sender !== win.webContents) throw new Error('DS Bot: this is not the Servers window')
    return handler(payload)
  }

  ipcMain.handle('ds-bot:servers-state', answer(() => ({
    // The page shows the address without the sign-in it may carry, so a token never sits in
    // a window that is only a list of names.
    servers: readServers(file).servers.map(server => ({ ...server, shown: shownRemoteUrl(server.url) ?? server.url })),
    currentUrl: shownRemoteUrl(options.currentUrl) ?? null,
    lang: options.lang ?? 'en',
  })))
  ipcMain.handle('ds-bot:servers-add', answer((entry) => {
    try {
      return addServer(file, { url: String(entry?.url ?? ''), name: String(entry?.name ?? '') })
    } catch (error) {
      return { error: error?.message ?? String(error) }
    }
  }))
  ipcMain.handle('ds-bot:servers-remove', answer(id => removeServer(file, String(id ?? ''))))
  ipcMain.handle('ds-bot:servers-connect', answer((id) => {
    const server = readServers(file).servers.find(entry => entry.id === String(id ?? ''))
    if (server === undefined) return { error: 'That server is no longer in the list' }
    close()
    options.onConnect(server.url)
    return { ok: true }
  }))
  // Back to a team in this app's own data: the same relaunch, without an address.
  ipcMain.handle('ds-bot:servers-local', answer(() => { close(); options.onLocal?.(); return { ok: true } }))
  ipcMain.handle('ds-bot:servers-close', answer(() => { close(); return { ok: true } }))

  win.once('ready-to-show', () => win.show())
  win.webContents.on('will-navigate', (event) => { event.preventDefault() })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.once('closed', drop)
  void win.loadFile(options.page)
  return win
}
