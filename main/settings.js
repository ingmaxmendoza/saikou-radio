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
  personalityPhrases: [
    "Stay locked in, this is Saikou Radio.",
    "We keep the vibes flowing, all day long.",
    "Don't touch that dial — more heat coming up.",
    "You're tuned in to the best station on your hard drive.",
    "Sit back, relax, and let Saikou Radio do the work.",
  ],
}

class SettingsStore {
  constructor(dataDir) {
    this._file = path.join(dataDir, 'settings.json')
    this._data = this._load()
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._file, 'utf8')
      return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULTS }
    }
  }

  get() {
    return { ...this._data }
  }

  save(partial) {
    this._data = { ...this._data, ...partial }
    fs.writeFileSync(this._file, JSON.stringify(this._data, null, 2), 'utf8')
    return this.get()
  }
}

module.exports = { SettingsStore, DEFAULTS }
