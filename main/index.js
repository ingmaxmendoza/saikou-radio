const { app, BrowserWindow, Menu, Tray, globalShortcut } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('./ipc')

Menu.setApplicationMenu(null)

let mainWindow
let tray
let quitting = false

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 440,
    resizable: false,
    frame: false,
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWindow.removeMenu()
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  // Closing hides to tray; music keeps playing. Quit lives in the tray menu.
  mainWindow.on('close', (e) => {
    if (!quitting) { e.preventDefault(); mainWindow.hide() }
  })
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/icon.ico'))
  tray.setToolTip('Saikou Radio')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / Hide', click: () => toggleWindow() },
    { type: 'separator' },
    { label: 'Play / Pause', click: () => sendCommand('toggle') },
    { label: 'Next', click: () => sendCommand('next') },
    { label: 'Previous', click: () => sendCommand('prev') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ]))
  tray.on('click', () => toggleWindow())
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) mainWindow.hide()
  else { mainWindow.show(); mainWindow.focus() }
}

function sendCommand(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('remote:command', { action })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()
  createTray()
  globalShortcut.register('MediaPlayPause', () => sendCommand('toggle'))
  globalShortcut.register('MediaNextTrack', () => sendCommand('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendCommand('prev'))
})

app.on('before-quit', () => { quitting = true })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

module.exports = { getMainWindow: () => mainWindow }
