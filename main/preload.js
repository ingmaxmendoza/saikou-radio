const { ipcRenderer } = require('electron')

window.saikouAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  synthesizeTTS: async (text, engine, voice) => {
    const buf = await ipcRenderer.invoke('tts:synthesize', { text, engine, voice })
    // IPC serializes Node Buffer as a plain object with numeric keys; coerce back
    if (buf instanceof Uint8Array) return buf
    return new Uint8Array(Object.values(buf))
  },
  openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  readFileAsBuffer: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readMetadata: (filePath) => ipcRenderer.invoke('metadata:read', filePath),
  openSettingsWindow: () => ipcRenderer.invoke('window:openSettings'),
  listVoices: (engine) => ipcRenderer.invoke('tts:listVoices', engine),
  setMiniMode: (on) => ipcRenderer.invoke(on ? 'window:mini' : 'window:restore'),
  setFullscreen: (on) => ipcRenderer.invoke(on ? 'window:fullscreen' : 'window:windowed'),
}
