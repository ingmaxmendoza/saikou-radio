// renderer/dj.js

function buildDJScript(currentTrack, nextTrack, timeStr, phrase) {
  const parts = []

  if (currentTrack.artist) {
    parts.push(`You just heard ${currentTrack.title} by ${currentTrack.artist}.`)
  } else {
    parts.push(`You just heard ${currentTrack.title}.`)
  }

  if (nextTrack) {
    if (nextTrack.artist) {
      parts.push(`Coming up next: ${nextTrack.title} by ${nextTrack.artist}.`)
    } else {
      parts.push(`Coming up next: ${nextTrack.title}.`)
    }
  }

  parts.push(`It's ${timeStr}.`)
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
