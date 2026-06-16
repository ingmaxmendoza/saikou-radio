// renderer/dj.js

const {
  getStructuralDecks,
  getPersonalityDeck,
  pickQuip,
  drawTimeLine,
} = require('./dj-content')

function detectLang(voice) {
  return (voice || '').toLowerCase().startsWith('es-') ? 'es' : 'en'
}

// Pure-ish assembler: given the personality phrase (and optional bonus line),
// draws the structural lines from the no-repeat decks and joins everything in
// order. Every break ends on a Saikou Radio sign-off.
//
// opts: { source, mentionPlaylist, bonus, hour, rng }
function buildDJScript(currentTrack, nextTrack, timeStr, phrase, voice, opts = {}) {
  const lang = detectLang(voice)
  const decks = getStructuralDecks(lang)
  const rng = opts.rng || Math.random
  const hour = (opts.hour != null) ? opts.hour : new Date().getHours()
  const parts = []

  parts.push(decks.heard.draw()(currentTrack.title, currentTrack.artist))

  // Strip the ";3" emoticon from spoken playlist names so the TTS doesn't read
  // it aloud. Display elsewhere (e.g. the sidebar) keeps the original name.
  const spokenSource = (opts.source || '').replace(/;3/g, '').replace(/\s+/g, ' ').trim()
  if (opts.mentionPlaylist && spokenSource) {
    parts.push(lang === 'es' ? `De la lista ${spokenSource}.` : `From the ${spokenSource} playlist.`)
  }

  if (nextTrack) {
    parts.push(decks.next.draw()(nextTrack.title, nextTrack.artist))
  }

  parts.push(drawTimeLine(lang, timeStr, hour, rng))

  if (phrase) parts.push(phrase)
  if (opts.bonus) parts.push(opts.bonus)

  parts.push(decks.signoff.draw())

  return parts.join(' ')
}

// Orchestrates a full break: draws the personality phrase (with any user-added
// phrases layered in), decides whether to drop a bonus quip or fact, then builds
// the script. Bonus flavor fires ~35% of breaks, weighted toward time/personality
// quips (~70%) over trivia (~30%).
function composeBreak(args) {
  const {
    currentTrack,
    nextTrack,
    timeStr,
    voice,
    settings = {},
    source = '',
    playlistCount = 0,
  } = args
  const now = args.now || new Date()
  const rng = args.rng || Math.random
  const lang = detectLang(voice)

  const extra = lang === 'es'
    ? (settings.personalityPhrasesES || [])
    : (settings.personalityPhrases || [])
  const phrase = getPersonalityDeck(lang, extra).draw()

  const mentionPlaylist = shouldMentionPlaylist(playlistCount, rng)
  const hour = now.getHours()

  let bonus = ''
  if (rng() < 0.35) {
    bonus = rng() < 0.70
      ? pickQuip(lang, hour, rng)
      : getStructuralDecks(lang).facts.draw()
  }

  return buildDJScript(currentTrack, nextTrack, timeStr, phrase, voice, {
    source, mentionPlaylist, bonus, hour, rng,
  })
}

function shouldMentionPlaylist(playlistCount, rand = Math.random) {
  const threshold = playlistCount >= 2 ? 0.60 : 0.15
  return rand() < threshold
}

function currentTimeString() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

class DJEngine {
  constructor({ playAudioBuffer, playJingle, synthesizeTTS, getSettings, getPlaylist, getNextTrack, onError, onScript }) {
    this._playAudioBuffer = playAudioBuffer
    this._playJingle = playJingle
    this._synthesizeTTS = synthesizeTTS
    this._getSettings = getSettings
    this._getPlaylist = getPlaylist
    this._getNextTrack = getNextTrack || null
    this._onError = onError || null
    this._onScript = onScript || null
  }

  async runBreak() {
    const settings = this._getSettings()
    const playlist = this._getPlaylist()
    const currentTrack = playlist.currentTrack()

    if (!currentTrack) return  // nothing to announce
    const nextTrack = this._getNextTrack
      ? this._getNextTrack()
      : (playlist.tracks[(playlist.currentIndex + 1) % playlist.tracks.length] ?? null)

    if (settings.jinglesEnabled && settings.jinglesFolder) {
      try {
        await this._playJingle(settings.jinglesFolder)
      } catch {
        // jingle failure is silent
      }
    }

    const source = currentTrack.source || ''
    const playlistCount = new Set(playlist.tracks.map(t => t.source).filter(Boolean)).size
    const script = composeBreak({
      currentTrack,
      nextTrack,
      timeStr: currentTimeString(),
      voice: settings.ttsVoice,
      settings,
      source,
      playlistCount,
    })
    if (this._onScript) this._onScript(script)

    try {
      const audioBuffer = await this._synthesizeTTS(script, settings.ttsEngine, settings.ttsVoice)
      await this._playAudioBuffer(audioBuffer)
    } catch (err) {
      console.error('[DJEngine] TTS error:', err)
      if (this._onError) this._onError(err.message)
    }
  }
}

module.exports = { DJEngine, buildDJScript, composeBreak, currentTimeString, shouldMentionPlaylist }
