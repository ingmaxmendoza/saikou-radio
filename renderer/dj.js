// renderer/dj.js

const HEARD_TEMPLATES = [
  (t, a) => a ? `You just heard ${t} by ${a}.` : `You just heard ${t}.`,
  (t, a) => a ? `That was ${t} from ${a}.` : `That was ${t}.`,
  (t, a) => a ? `${a} with ${t} — hope you enjoyed that one.` : `That was ${t} — hope you enjoyed it.`,
  (t, a) => a ? `Fresh off the playlist, ${t} by ${a}.` : `That one was ${t}.`,
  (t, a) => a ? `${t} by ${a}, doing what it does.` : `${t}, right there.`,
]

const NEXT_TEMPLATES = [
  (t, a) => a ? `Coming up next: ${t} by ${a}.` : `Coming up next: ${t}.`,
  (t, a) => a ? `Next up, ${a} with ${t}.` : `Next up, ${t}.`,
  (t, a) => a ? `Stick around for ${t} by ${a}.` : `Stick around for ${t}.`,
  (t, a) => a ? `Up next — ${t} from ${a}.` : `And then we've got ${t} coming your way.`,
]

const TIME_TEMPLATES = [
  (s) => `It's ${s}.`,
  (s) => `Clock's showing ${s}.`,
  (s) => `The time right now is ${s}.`,
  (s) => `${s} on the dot.`,
]

function buildDJScript(currentTrack, nextTrack, timeStr, phrase) {
  const parts = []

  const heardFn = HEARD_TEMPLATES[Math.floor(Math.random() * HEARD_TEMPLATES.length)]
  parts.push(heardFn(currentTrack.title, currentTrack.artist))

  if (nextTrack) {
    const nextFn = NEXT_TEMPLATES[Math.floor(Math.random() * NEXT_TEMPLATES.length)]
    parts.push(nextFn(nextTrack.title, nextTrack.artist))
  }

  const timeFn = TIME_TEMPLATES[Math.floor(Math.random() * TIME_TEMPLATES.length)]
  parts.push(timeFn(timeStr))

  if (phrase) parts.push(phrase)
  parts.push("You're listening to Saikou Radio.")

  return parts.join(' ')
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

function currentTimeString() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

class DJEngine {
  constructor({ playAudioBuffer, playJingle, synthesizeTTS, getSettings, getPlaylist }) {
    this._playAudioBuffer = playAudioBuffer
    this._playJingle = playJingle
    this._synthesizeTTS = synthesizeTTS
    this._getSettings = getSettings
    this._getPlaylist = getPlaylist
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

    const phrase = pickRandom(settings.personalityPhrases)
    const script = buildDJScript(currentTrack, nextTrack, currentTimeString(), phrase)

    try {
      const audioBuffer = await this._synthesizeTTS(script, settings.ttsEngine, settings.ttsVoice)
      await this._playAudioBuffer(audioBuffer)
    } catch {
      // TTS failure: resume music silently
    }
  }
}

module.exports = { DJEngine, buildDJScript, pickRandom, currentTimeString }
