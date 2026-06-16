// main/ipc.js
const { ipcMain, dialog, app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { SettingsStore } = require('./settings')
const { synthesize } = require('./tts')

// Lazy-load to avoid circular require (index.js requires ipc.js)
function getMainWindow() { return require('./index').getMainWindow() }

let settingsWindow = null

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
  ipcMain.handle('window:openSettings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus()
      return
    }
    settingsWindow = new BrowserWindow({
      width: 480,
      height: 560,
      resizable: false,
      title: 'Settings',
      parent: getMainWindow(),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    })
    settingsWindow.setMenu(null)
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'))
    settingsWindow.on('closed', () => { settingsWindow = null })
  })

  // Settings window signals save → relay to main renderer
  ipcMain.on('settings:notify-reload', () => {
    const win = getMainWindow()
    if (win) win.webContents.send('settings:reload')
  })

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

  ipcMain.handle('tts:listVoices', async (_e, engine) => {
    if (engine === 'sapi') {
      const { execSync } = require('child_process')
      try {
        const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | ForEach-Object {
  $v = $_.VoiceInfo
  "$($v.Name)|$($v.Culture)|$($v.Gender)"
}
`
        const out = execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, { timeout: 8000 }).toString()
        return out.trim().split('\n').filter(Boolean).map(line => {
          const [name, culture, gender] = line.trim().split('|')
          return { name, culture, gender }
        })
      } catch {
        return []
      }
    }
    // Edge TTS — return a curated list of common EN/ES neural voices
    return [
      { name: 'en-US-AriaNeural',    culture: 'en-US', gender: 'Female' },
      { name: 'en-US-GuyNeural',     culture: 'en-US', gender: 'Male'   },
      { name: 'en-US-JennyNeural',   culture: 'en-US', gender: 'Female' },
      { name: 'en-US-DavisNeural',   culture: 'en-US', gender: 'Male'   },
      { name: 'en-GB-SoniaNeural',   culture: 'en-GB', gender: 'Female' },
      { name: 'en-GB-RyanNeural',    culture: 'en-GB', gender: 'Male'   },
      { name: 'es-MX-DaliaNeural',   culture: 'es-MX', gender: 'Female' },
      { name: 'es-MX-JorgeNeural',   culture: 'es-MX', gender: 'Male'   },
      { name: 'es-ES-ElviraNeural',  culture: 'es-ES', gender: 'Female' },
      { name: 'es-ES-AlvaroNeural',  culture: 'es-ES', gender: 'Male'   },
    ]
  })

  ipcMain.handle('metadata:read', async (_e, filePath) => {
    try {
      const { parseFile } = require('music-metadata')
      const meta = await parseFile(filePath, { skipCovers: false })
      const { title, artist, album, picture } = meta.common
      let pictureDataUrl = null
      if (picture && picture.length > 0) {
        const pic = picture[0]
        pictureDataUrl = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
      }
      return { title: title || null, artist: artist || null, album: album || null, picture: pictureDataUrl }
    } catch (err) {
      console.error('[metadata:read]', err.message)
      return { title: null, artist: null, album: null, picture: null }
    }
  })

  let miniMoveListener = null

  function snapMiniToCorner(win) {
    const { screen } = require('electron')
    const { workArea } = screen.getPrimaryDisplay()
    const [w, h] = win.getSize()
    const [x] = win.getPosition()
    const winCenterX = x + w / 2
    const screenCenterX = workArea.x + workArea.width / 2
    if (winCenterX < screenCenterX) {
      // snap bottom-left
      win.setPosition(workArea.x, workArea.y + workArea.height - h)
    } else {
      // snap bottom-right
      win.setPosition(workArea.x + workArea.width - w, workArea.y + workArea.height - h)
    }
  }

  ipcMain.handle('window:mini', () => {
    const win = getMainWindow()
    if (!win) return
    const { screen } = require('electron')
    const { workArea } = screen.getPrimaryDisplay()
    win.setResizable(true)
    win.setContentSize(480, 100)
    const [w, h] = win.getSize()
    // Start bottom-right
    win.setPosition(workArea.x + workArea.width - w, workArea.y + workArea.height - h)
    win.setAlwaysOnTop(true)
    win.setResizable(false)

    // Snap to nearest corner whenever the window stops moving
    miniMoveListener = () => snapMiniToCorner(win)
    win.on('moved', miniMoveListener)
  })

  ipcMain.handle('window:restore', () => {
    const win = getMainWindow()
    if (!win) return
    const { screen } = require('electron')
    const { workArea } = screen.getPrimaryDisplay()

    if (miniMoveListener) {
      win.removeListener('moved', miniMoveListener)
      miniMoveListener = null
    }

    win.setResizable(true)
    win.setContentSize(760, 440)
    win.setPosition(
      workArea.x + Math.floor((workArea.width - 760) / 2),
      workArea.y + Math.floor((workArea.height - 440) / 2)
    )
    const store = getStore()
    win.setAlwaysOnTop(store.get().alwaysOnTop ?? false)
    win.setResizable(false)
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
