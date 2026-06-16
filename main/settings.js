// main/settings.js
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  breakInterval: 15,
  ttsEngine: 'edge',
  ttsVoice: 'en-US-AriaNeural',
  jinglesEnabled: false,
  jinglesFolder: '',
  theme: 'y2k-silver',
  customThemePath: '',
  loop: true,
  shuffle: false,
  alwaysOnTop: false,
  fadeSeconds: 2,
  volume: 1,
  visualizerStyle: 'bars',
  visualizerAutoRotate: false,
  visualizerRotateEvery: 3,
  ambientArtBackground: true,
  djSubtitles: true,
  remoteEnabled: false,
  remotePort: 7000,
  pomodoroWork: 25,
  pomodoroShortBreak: 5,
  pomodoroLongBreak: 15,
  pomodoroLongEvery: 4,
  pomodoroFocusPhrases: [
    "Time to focus.",
    "Heads down — let's get to work.",
    "Focus block starting now.",
    "Lock in. This is your time.",
    "Deep work mode — let's go.",
  ],
  pomodoroFocusPhrasesES: [
    "Hora de concentrarse.",
    "A trabajar, sin distracciones.",
    "Empieza tu bloque de enfoque.",
    "Concéntrate, este es tu momento.",
    "Modo de trabajo profundo, vamos.",
  ],
  pomodoroBreakPhrases: [
    "Break time — relax.",
    "Step away, stretch, breathe.",
    "Take five. You earned it.",
    "Rest up — you've been grinding.",
    "Short break. Recharge.",
  ],
  pomodoroBreakPhrasesES: [
    "Tiempo de descanso, relájate.",
    "Levántata, estírate, respira.",
    "Tómate cinco. Te lo ganaste.",
    "Descansa, has estado trabajando duro.",
    "Pausa corta. Recarga energías.",
  ],
  playlistFolder: '',
  // The DJ ships with a large built-in, bilingual rotation of personality
  // phrases, quips and facts (see renderer/dj-content.js). These two lists are
  // OPTIONAL extras that get layered on top of the built-in rotation, so they
  // default to empty. Anything the user adds here joins the deck as bonus lines.
  personalityPhrasesES: [],
  personalityPhrases: [],
}

class SettingsStore {
  constructor(dataDir) {
    this._file = path.join(dataDir, 'settings.json')
    this._data = this._load()
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._file, 'utf8')
      try {
        return { ...DEFAULTS, ...JSON.parse(raw) }
      } catch (parseErr) {
        console.error('[SettingsStore] Corrupt settings.json, using defaults:', parseErr.message)
        return { ...DEFAULTS }
      }
    } catch (readErr) {
      if (readErr.code !== 'ENOENT') {
        console.error('[SettingsStore] Could not read settings.json:', readErr.message)
      }
      return { ...DEFAULTS }
    }
  }

  get() {
    return { ...this._data }
  }

  save(partial) {
    this._data = { ...this._data, ...partial }
    const tmp = this._file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), 'utf8')
    fs.renameSync(tmp, this._file)
    return this.get()
  }
}

module.exports = { SettingsStore, DEFAULTS }
