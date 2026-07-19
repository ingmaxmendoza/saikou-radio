const { app, BrowserWindow, Menu, globalShortcut } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('./ipc')

Menu.setApplicationMenu(null)

let mainWindow

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
}

function sendCommand(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('remote:command', { action })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()
  globalShortcut.register('MediaPlayPause', () => sendCommand('toggle'))
  globalShortcut.register('MediaNextTrack', () => sendCommand('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendCommand('prev'))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

module.exports = { getMainWindow: () => mainWindow }
