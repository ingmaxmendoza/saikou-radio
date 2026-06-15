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
  personalityPhrasesES: [
    "Sigue sintonizado, esto es Saikou Radio.",
    "Mantenemos el flow toda la noche.",
    "No cambies de estación — viene más música.",
    "Sintonizado a la mejor estación de tu disco duro.",
    "Sin anuncios, sin interrupciones — pura música.",
    "Otro set, otro bloque de bangers. Vamos.",
    "Si estás trabajando, sigue adelante. Nosotros ponemos el soundtrack.",
    "Este ha sido tu chequeo de vibras programado.",
    "La música no para, y nosotros tampoco.",
    "Esto es lo que pasa cuando dejas el algoritmo atrás.",
    "Tu playlist, tu mundo. Aquí no hay skip obligatorio.",
    "El buen gusto no se programa solo — por eso estamos aquí.",
    "Recuerda hidratarte. La música puede esperar, tú no.",
    "Saikou Radio: sin comerciales, sin drama, pura vibra.",
    "Si alguien te pregunta qué estás escuchando, diles que es cultura.",
    "Quedaste bien sintonizado. No fue accidente.",
    "Esta canción que viene es para los que saben.",
    "Aquí no se pone cualquier cosa — se pone lo que se siente.",
    "El silencio es para los que no tienen buena música.",
    "Seguimos. Siempre seguimos.",
  ],
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
    "The music doesn't stop, and neither do we.",
    "This is what happens when you skip the algorithm.",
    "Your playlist, your world. No forced skips here.",
    "Good taste doesn't curate itself — that's what we're here for.",
    "Remember to hydrate. The music can wait, you can't.",
    "Saikou Radio: no commercials, no drama, just vibes.",
    "If someone asks what you're listening to, tell them it's taste.",
    "You tuned in at the right time. That wasn't an accident.",
    "The next track is for people who know.",
    "We don't play just anything — we play what hits.",
    "Silence is for people without good playlists.",
    "We keep going. We always keep going.",
    "No DJ requests — but consider this a gift anyway.",
    "Wherever you are, we hope the music is making it better.",
    "Back to back, no filler, no fluff.",
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
