// main/ipc.js
const { ipcMain, dialog, app } = require('electron')
const fs = require('fs')
const { SettingsStore } = require('./settings')
const { synthesize } = require('./tts')
const { getMainWindow } = require('./index')

const store = new SettingsStore(app.getPath('userData'))

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => store.get())

  ipcMain.handle('settings:save', (_e, partial) => {
    const saved = store.save(partial)
    const win = getMainWindow()
    if (win && typeof partial.alwaysOnTop === 'boolean') {
      win.setAlwaysOnTop(partial.alwaysOnTop)
    }
    return saved
  })

  ipcMain.handle('tts:synthesize', async (_e, { text, engine, voice }) => {
    return await synthesize(text, engine, voice)
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
    return fs.readFileSync(filePath)
  })
}

module.exports = { registerIpcHandlers }
