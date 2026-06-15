// renderer/dj.js

const TEMPLATES = {
  en: {
    heard: [
      (t, a) => a ? `You just heard ${t} by ${a}.` : `You just heard ${t}.`,
      (t, a) => a ? `That was ${t} from ${a}.` : `That was ${t}.`,
      (t, a) => a ? `${a} with ${t} — hope you enjoyed that one.` : `That was ${t} — hope you enjoyed it.`,
      (t, a) => a ? `Fresh off the playlist, ${t} by ${a}.` : `That one was ${t}.`,
      (t, a) => a ? `${t} by ${a}, doing what it does.` : `${t}, right there.`,
    ],
    next: [
      (t, a) => a ? `Coming up next: ${t} by ${a}.` : `Coming up next: ${t}.`,
      (t, a) => a ? `Next up, ${a} with ${t}.` : `Next up, ${t}.`,
      (t, a) => a ? `Stick around for ${t} by ${a}.` : `Stick around for ${t}.`,
      (t, a) => a ? `Up next — ${t} from ${a}.` : `And then we've got ${t} coming your way.`,
    ],
    time: [
      (s) => `It's ${s}.`,
      (s) => `Clock's showing ${s}.`,
      (s) => `The time right now is ${s}.`,
      (s) => `${s} on the dot.`,
    ],
    sign: `You're listening to Saikou Radio.`,
  },
  es: {
    heard: [
      (t, a) => a ? `Acabas de escuchar ${t} de ${a}.` : `Acabas de escuchar ${t}.`,
      (t, a) => a ? `Eso fue ${t} de ${a}.` : `Eso fue ${t}.`,
      (t, a) => a ? `${a} con ${t} — espero que lo hayas disfrutado.` : `Eso fue ${t} — esperamos que te haya gustado.`,
      (t, a) => a ? `Directo del playlist, ${t} de ${a}.` : `Esa fue ${t}.`,
      (t, a) => a ? `${t} de ${a}, haciendo lo suyo.` : `${t}, ahí tienen.`,
    ],
    next: [
      (t, a) => a ? `A continuación: ${t} de ${a}.` : `A continuación: ${t}.`,
      (t, a) => a ? `Lo que sigue, ${a} con ${t}.` : `Lo que sigue, ${t}.`,
      (t, a) => a ? `Quédate para ${t} de ${a}.` : `Quédate para ${t}.`,
      (t, a) => a ? `Lo próximo — ${t} de ${a}.` : `Y luego les traemos ${t}.`,
    ],
    time: [
      (s) => `Son las ${s}.`,
      (s) => `El reloj marca las ${s}.`,
      (s) => `En este momento son las ${s}.`,
      (s) => `Las ${s} en punto.`,
    ],
    sign: `Estás escuchando Saikou Radio.`,
  },
}

function detectLang(voice) {
  return (voice || '').toLowerCase().startsWith('es-') ? 'es' : 'en'
}

function buildDJScript(currentTrack, nextTrack, timeStr, phrase, voice) {
  const lang = detectLang(voice)
  const T = TEMPLATES[lang]
  const parts = []

  const heardFn = T.heard[Math.floor(Math.random() * T.heard.length)]
  parts.push(heardFn(currentTrack.title, currentTrack.artist))

  if (nextTrack) {
    const nextFn = T.next[Math.floor(Math.random() * T.next.length)]
    parts.push(nextFn(nextTrack.title, nextTrack.artist))
  }

  const timeFn = T.time[Math.floor(Math.random() * T.time.length)]
  parts.push(timeFn(timeStr))

  if (phrase) parts.push(phrase)
  parts.push(T.sign)

  return parts.join(' ')
}

const PHRASE_HISTORY_SIZE = 5
const _phraseHistory = { en: [], es: [] }

function pickPhrase(arr, lang) {
  if (!arr || arr.length === 0) return ''
  const history = _phraseHistory[lang] || []
  // Filter out recently used phrases; fall back to full list if all were used recently
  const available = arr.filter(p => !history.includes(p))
  const pool = available.length > 0 ? available : arr
  const picked = pool[Math.floor(Math.random() * pool.length)]
  // Record and trim history
  history.push(picked)
  if (history.length > PHRASE_HISTORY_SIZE) history.shift()
  _phraseHistory[lang] = history
  return picked
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

function currentTimeString() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

class DJEngine {
  constructor({ playAudioBuffer, playJingle, synthesizeTTS, getSettings, getPlaylist, onError }) {
    this._playAudioBuffer = playAudioBuffer
    this._playJingle = playJingle
    this._synthesizeTTS = synthesizeTTS
    this._getSettings = getSettings
    this._getPlaylist = getPlaylist
    this._onError = onError || null
  }

  async runBreak() {
    const settings = this._getSettings()
    const playlist = this._getPlaylist()
    const currentTrack = playlist.currentTrack()

    if (!currentTrack) return  // nothing to announce
    const nextIndex = (playlist.currentIndex + 1) % playlist.tracks.length
    const nextTrack = playlist.tracks[nextIndex] ?? null

    if (settings.jinglesEnabled && settings.jinglesFolder) {
      try {
        await this._playJingle(settings.jinglesFolder)
      } catch {
        // jingle failure is silent
      }
    }

    const lang = detectLang(settings.ttsVoice)
    const phrases = lang === 'es'
      ? (settings.personalityPhrasesES || [])
      : (settings.personalityPhrases || [])
    const phrase = pickPhrase(phrases, lang)
    const script = buildDJScript(currentTrack, nextTrack, currentTimeString(), phrase, settings.ttsVoice)

    try {
      const audioBuffer = await this._synthesizeTTS(script, settings.ttsEngine, settings.ttsVoice)
      await this._playAudioBuffer(audioBuffer)
    } catch (err) {
      console.error('[DJEngine] TTS error:', err)
      if (this._onError) this._onError(err.message)
    }
  }
}

module.exports = { DJEngine, buildDJScript, pickRandom, currentTimeString }
