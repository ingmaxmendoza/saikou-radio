// main/ipc.js
const { ipcMain, dialog, app } = require('electron')
const fs = require('fs')
const path = require('path')
const { SettingsStore } = require('./settings')
const { synthesize } = require('./tts')

// Lazy-load to avoid circular require (index.js requires ipc.js)
function getMainWindow() { return require('./index').getMainWindow() }

const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus',
  '.m3u', '.m3u8',
])

let store = null

function getStore() {
  if (!store) store = new SettingsStore(app.getPath('userData'))
  return store
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => getStore().get())

  ipcMain.handle('settings:save', (_e, partial) => {
    const saved = getStore().save(partial)
    const win = getMainWindow()
    if (win && typeof partial.alwaysOnTop === 'boolean') {
      win.setAlwaysOnTop(partial.alwaysOnTop)
    }
    return saved
  })

  ipcMain.handle('tts:synthesize', async (_e, { text, engine, voice }) => {
    try {
      return await synthesize(text, engine, voice)
    } catch (err) {
      throw new Error(`TTS failed: ${err.message}`)
    }
  })

  ipcMain.handle('dialog:openFile', async (_e, opts) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: opts?.filters ?? [{ name: 'Playlist', extensions: ['m3u', 'm3u8'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:readFile', (_e, filePath) => {
    const ext = path.extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`fs:readFile blocked: extension '${ext}' not allowed`)
    }
    return fs.readFileSync(filePath)
  })
}

module.exports = { registerIpcHandlers }
