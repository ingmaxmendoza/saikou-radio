const { app, BrowserWindow, Menu } = require('electron')
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

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

module.exports = { getMainWindow: () => mainWindow }
