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
    "No ads, no interruptions — just the music.",
    "We don't take requests, but we do take care of you.",
    "Another hour, another set of bangers. Let's go.",
    "If you're working, keep grinding. We've got the soundtrack.",
    "This has been your regularly scheduled vibe check.",
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
