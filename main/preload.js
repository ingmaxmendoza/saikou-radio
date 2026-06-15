const { ipcRenderer } = require('electron')

window.saikouAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  synthesizeTTS: (text, engine, voice) =>
    ipcRenderer.invoke('tts:synthesize', { text, engine, voice }),
  openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  readFileAsBuffer: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readMetadata: (filePath) => ipcRenderer.invoke('metadata:read', filePath),
  openSettingsWindow: () => ipcRenderer.invoke('window:openSettings'),
  listVoices: (engine) => ipcRenderer.invoke('tts:listVoices', engine),
}
