// renderer/app.js
const { PlaylistManager } = require('./playlist')
const { AudioPlayer } = require('./audio')
const { BreakScheduler } = require('./scheduler')
const { DJEngine } = require('./dj')
const { ThemeEngine } = require('./theme')
const { VisualizerEngine } = require('./visualizer')
const { nextFromQueue } = require('./remote-queue')
const { PomodoroTimer } = require('./pomodoro')
const fs = require('fs')
const path = require('path')

let settings = {}
const failedTracks = new Set()
let playlist = new PlaylistManager()
let audio = new AudioPlayer()
let theme = new ThemeEngine()
let scheduler = null
let isPlaying = false
let breakPending = false
let countdownIntervalId = null
let currentArtist = ''
let visualizer = null
let isFullscreen = false
let chromeTimer = null
let rotateCounter = 0
let requestQueue = []
let lastElapsed = 0
let pomodoro = null
let sleepEndsAt = null
let sleepFading = false

// --- DOM refs ---
const $ = (id) => document.getElementById(id)
const trackTitle = $('track-title')
const trackMeta = $('track-meta')
const seekSlider = $('seek-slider')
const playlistList = $('playlist-list')
const djCountdown = $('dj-countdown')
const djEngineEl = $('dj-engine')
const djJingles = $('dj-jingles')
const djStatus = $('dj-status')
const clockEl = $('clock')
const btnPlay = $('btn-play')
const btnMono = $('btn-mono')
const btnShuffle = $('btn-shuffle')
const albumArt = $('album-art')
const volumeSlider = $('volume-slider')
const fsVolume = $('fs-volume')

function applyVolume(v, persist) {
  const vol = Math.max(0, Math.min(1, v))
  audio.setVolume(vol)
  const pct = Math.round(vol * 100)
  if (volumeSlider) volumeSlider.value = pct
  if (fsVolume) fsVolume.value = pct
  if (persist) {
    settings.volume = vol
    window.saikouAPI.saveSettings({ volume: vol })
  }
  pushRemoteTick()
}

if (volumeSlider) volumeSlider.addEventListener('input', () => applyVolume(volumeSlider.value / 100, true))
if (fsVolume) fsVolume.addEventListener('input', () => applyVolume(fsVolume.value / 100, true))

const fsTitle = $('fs-title')
const fsArtist = $('fs-artist')
const fsCountdown = $('fs-countdown')
const fsAmbient = $('fs-ambient')
const fsSubtitle = $('fs-subtitle')
visualizer = new VisualizerEngine($('viz-canvas'), () => audio.getAnalyser())

let monoEnabled = false
let seekDragging = false
let shuffleQueue = []   // shuffled indices
let shufflePos = 0      // current position in queue

function buildShuffleQueue(currentIndex) {
  const indices = playlist.tracks.map((_, i) => i)
  // Fisher-Yates
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  // Put the current track first so playback is seamless
  const pos = indices.indexOf(currentIndex)
  if (pos > 0) indices.unshift(...indices.splice(pos, 1))
  shuffleQueue = indices
  shufflePos = 0
}

// --- Clock ---
function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
setInterval(updateClock, 1000)
updateClock()

// --- Settings ---
async function loadSettings() {
  settings = await window.saikouAPI.getSettings()
  theme.apply(settings.theme, settings.customThemePath)
  djEngineEl.textContent = (settings.ttsEngine || 'edge').toUpperCase()
  djJingles.textContent = settings.jinglesEnabled ? 'ON' : 'OFF'
  audio.setFadeDuration(settings.fadeSeconds ?? 2)
  applyVolume(settings.volume ?? 1, false)
  if (visualizer) {
    visualizer.setStyle(settings.visualizerStyle || 'bars')
    setTimeout(() => visualizer.refreshColors(), 150)
  }
  btnShuffle.classList.toggle('active', !!settings.shuffle)
  if (pomodoro) pomodoro.configure({
    focus: settings.pomodoroWork, short: settings.pomodoroShortBreak,
    long: settings.pomodoroLongBreak, longEvery: settings.pomodoroLongEvery,
  })
}

// --- Playlist rendering ---
function makeTrackRow(i) {
  const t = playlist.tracks[i]
  const isActive = i === playlist.currentIndex
  const div = document.createElement('div')
  div.className = 'pl-track' + (t.error ? ' error' : '') + (isActive ? ' active' : '')
  div.textContent = (isActive ? '► ' : '') + (t.artist ? `${t.artist} - ${t.title}` : t.title)
  div.onclick = () => {
    if (settings.shuffle) shufflePos = shuffleQueue.indexOf(i)
    playTrackAt(i)
  }
  return div
}

function renderPlaylist() {
  playlistList.innerHTML = ''
  const shuffleActive = settings.shuffle && shuffleQueue.length === playlist.tracks.length
  if (shuffleActive) {
    shuffleQueue.forEach(i => playlistList.appendChild(makeTrackRow(i)))
    return
  }
  let lastSource = null
  playlist.tracks.forEach((t, i) => {
    if (t.source !== lastSource) {
      lastSource = t.source
      const h = document.createElement('div')
      h.className = 'pl-group'
      h.textContent = t.source || 'Playlist'
      playlistList.appendChild(h)
    }
    playlistList.appendChild(makeTrackRow(i))
  })
}

async function loadPlaylists(paths, { append = true } = {}) {
  if (!paths || paths.length === 0) return
  const openBtn = $('open-btn')
  try {
    if (!append) { playlist.clear(); failedTracks.clear(); requestQueue = [] }
    const startIndex = playlist.tracks.length
    for (const p of paths) {
      const bytes = await window.saikouAPI.readFileAsBuffer(p)
      const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes))
      const text = new TextDecoder().decode(buf)
      playlist.addFromText(text, p)
    }
    renderPlaylist()
    if (playlist.tracks.length === 0) { djStatus.textContent = 'No tracks found in playlist.'; return }

    openBtn.disabled = true
    if (!isPlaying) { trackTitle.textContent = 'Loading playlist...'; trackMeta.textContent = '' }

    const pending = playlist.tracks.filter(t => !t._metaLoaded)
    const total = pending.length
    let loaded = 0
    djStatus.textContent = `0 / ${total}`
    const BATCH = 8
    for (let i = 0; i < total; i += BATCH) {
      await Promise.all(pending.slice(i, i + BATCH).map(async (track) => {
        try {
          const meta = await window.saikouAPI.readMetadata(track.path)
          if (meta.title)  track.title  = meta.title
          if (meta.artist) track.artist = meta.artist
          track._picture = meta.picture
        } catch {}
        track._metaLoaded = true
        loaded++
        djStatus.textContent = `${loaded} / ${total}`
      }))
      renderPlaylist()
    }

    openBtn.disabled = false
    djStatus.textContent = ''
    if (settings.shuffle && playlist.tracks.length > 1) buildShuffleQueue(isPlaying ? playlist.currentIndex : 0)
    if (!scheduler) {
      scheduler = new BreakScheduler(settings.breakInterval, () => { breakPending = true })
      scheduler.start()
      startCountdownDisplay()
    }
    if (!isPlaying) {
      await playTrackAt(settings.shuffle ? shuffleQueue[0] : startIndex)
    }
    pushRemoteState()
  } catch (err) {
    openBtn.disabled = false
    djStatus.textContent = `Error: ${err.message}`
    console.error('loadPlaylists error:', err)
  }
}

async function clearPlaylists() {
  await audio.pause()
  playlist.clear()
  failedTracks.clear()
  requestQueue = []
  shuffleQueue = []
  isPlaying = false
  btnPlay.textContent = '>'
  trackTitle.textContent = 'No playlist loaded'
  trackMeta.textContent = 'Open a .m3u file to begin'
  albumArt.classList.remove('visible'); albumArt.src = ''
  if (scheduler) { scheduler.stop(); scheduler = null }
  renderPlaylist()
  syncMiniPlay()
  pushRemoteState()
}

function updateNowPlaying() {
  const t = playlist.currentTrack()
  if (!t) return
  trackTitle.textContent = t.title || 'Unknown'
  currentArtist = t.artist || ''
  trackMeta.textContent = currentArtist
  renderPlaylist()
  syncMiniTrack()
  if (isFullscreen) syncFullscreenInfo()
  pushRemoteState()
}

// --- Metadata ---
function showAlbumArt(track) {
  const pic = track._picture
  if (pic) {
    albumArt.src = pic
    albumArt.classList.add('visible')
  } else {
    albumArt.src = ''
    albumArt.classList.remove('visible')
  }
  if (visualizer) visualizer.setArt(pic || null)
  if (fsAmbient) {
    if (pic && settings.ambientArtBackground !== false) {
      fsAmbient.src = pic
      fsAmbient.classList.add('visible')
    } else {
      fsAmbient.classList.remove('visible')
      fsAmbient.src = ''
    }
  }
}

// --- Playback ---
async function playTrackAt(index) {
  if (failedTracks.has(index)) return
  playlist.jumpTo(index)
  const track = playlist.currentTrack()
  updateNowPlaying()
  showAlbumArt(track)
  seekSlider.value = 0
  try {
    await audio.playFile(track.path)
    isPlaying = true
    btnPlay.textContent = '||'
    syncMiniPlay()
    if (isFullscreen && settings.visualizerAutoRotate && visualizer) {
      rotateCounter++
      if (rotateCounter >= (settings.visualizerRotateEvery || 3)) { rotateCounter = 0; cycleVisualizer() }
    }
  } catch (err) {
    console.error('playTrackAt error:', err)
    if (track) { track.error = true; djStatus.textContent = `Skip: ${err.message}` }
    failedTracks.add(index)
    renderPlaylist()
    await playNext()
  }
}

async function playNext() {
  if (requestQueue.length > 0) {
    const idx = nextFromQueue(requestQueue)
    if (settings.shuffle) shufflePos = shuffleQueue.indexOf(idx)
    await playTrackAt(idx)
    return
  }
  if (settings.shuffle && playlist.tracks.length > 1) {
    shufflePos++
    if (shufflePos >= shuffleQueue.length) {
      // Full cycle done — generate a new order
      buildShuffleQueue(shuffleQueue[0] ?? 0)
    }
    await playTrackAt(shuffleQueue[shufflePos])
  } else {
    playlist.advance(settings.loop)
    await playTrackAt(playlist.currentIndex)
  }
}

async function runDJBreak() {
  breakPending = false
  djStatus.textContent = 'ON AIR...'
  const dj = new DJEngine({
    playAudioBuffer: (buf) => audio.playBuffer(buf),
    playJingle: async (folder) => {
      const files = fs.readdirSync(folder).filter(f => /\.(mp3|wav|ogg)$/i.test(f))
      if (files.length === 0) return
      const pick = files[Math.floor(Math.random() * files.length)]
      await audio.playFile(path.join(folder, pick))
    },
    synthesizeTTS: (text, engine, voice) => window.saikouAPI.synthesizeTTS(text, engine, voice),
    getSettings: () => settings,
    getPlaylist: () => playlist,
    getNextTrack: () => {
      if (requestQueue.length > 0) return playlist.tracks[requestQueue[0]] ?? null
      if (settings.shuffle && shuffleQueue.length > 0) {
        const nextPos = shufflePos + 1
        const nextIdx = nextPos < shuffleQueue.length ? shuffleQueue[nextPos] : shuffleQueue[0]
        return playlist.tracks[nextIdx] ?? null
      }
      return playlist.tracks[(playlist.currentIndex + 1) % playlist.tracks.length] ?? null
    },
    onError: (msg) => { djStatus.textContent = `TTS error: ${msg}` },
    onScript: (script) => { if (settings.djSubtitles) showSubtitle(script) },
  })
  await dj.runBreak()
  hideSubtitle()
  djStatus.textContent = ''
  if (scheduler) scheduler.reset()
}

function syncFullscreenInfo() {
  const t = playlist.currentTrack()
  if (!t) return
  fsTitle.textContent = t.title || 'Unknown'
  fsArtist.textContent = t.artist || ''
}

function armChromeHide() {
  clearTimeout(chromeTimer)
  document.body.classList.remove('chrome-hidden')
  chromeTimer = setTimeout(() => { if (isFullscreen) document.body.classList.add('chrome-hidden') }, 3000)
}

async function enterFullscreen() {
  if (isFullscreen) return
  isFullscreen = true
  rotateCounter = 0
  document.body.classList.add('fullscreen')
  await window.saikouAPI.setFullscreen(true)
  syncFullscreenInfo()
  if (visualizer) { visualizer.refreshColors(); visualizer.resize(); visualizer.start() }
  armChromeHide()
}

async function exitFullscreen() {
  if (!isFullscreen) return
  isFullscreen = false
  document.body.classList.remove('fullscreen', 'chrome-hidden')
  clearTimeout(chromeTimer)
  if (visualizer) visualizer.stop()
  await window.saikouAPI.setFullscreen(false)
}

function toggleFullscreen() { isFullscreen ? exitFullscreen() : enterFullscreen() }

function showSubtitle(text) { if (fsSubtitle) { fsSubtitle.textContent = text; fsSubtitle.classList.add('visible') } }
function hideSubtitle() { if (fsSubtitle) fsSubtitle.classList.remove('visible') }

function cycleVisualizer() {
  if (!visualizer) return
  const style = visualizer.nextStyle()
  settings.visualizerStyle = style
  window.saikouAPI.saveSettings({ visualizerStyle: style })
}

function pomodoroLang() { return (settings.ttsVoice || '').toLowerCase().startsWith('es-') ? 'es' : 'en' }
function pickPomodoroPhrase(kindGroup) {
  const lang = pomodoroLang()
  let arr
  if (kindGroup === 'focus') arr = lang === 'es' ? settings.pomodoroFocusPhrasesES : settings.pomodoroFocusPhrases
  else arr = lang === 'es' ? settings.pomodoroBreakPhrasesES : settings.pomodoroBreakPhrases
  arr = arr || []
  if (arr.length === 0) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

async function speakOverMusic(text) {
  if (!text) return
  const wasPlaying = isPlaying
  const resumeAt = lastElapsed
  const track = playlist.currentTrack()
  try {
    const buf = await window.saikouAPI.synthesizeTTS(text, settings.ttsEngine, settings.ttsVoice)
    await audio.playBuffer(buf)
  } catch (err) {
    console.error('[pomodoro speak]', err)
  }
  if (wasPlaying && track) {
    try { await audio.playFile(track.path); audio.seekTo(resumeAt) } catch {}
  }
}

pomodoro = new PomodoroTimer({
  onPhaseChange: ({ phase, kind }) => {
    if (phase === 'idle') return
    speakOverMusic(pickPomodoroPhrase(phase === 'focus' ? 'focus' : 'break'))
    updateTimerUI()
  },
  onTick: () => { updateTimerUI() },
})

function setSleep(minutes) {
  if (!minutes || minutes <= 0) { sleepEndsAt = null; updateTimerUI(); return }
  sleepEndsAt = Date.now() + minutes * 60000
  updateTimerUI()
}

function sleepRemainingMs() { return sleepEndsAt ? Math.max(0, sleepEndsAt - Date.now()) : 0 }

async function sleepFadeOutAndPause() {
  if (sleepFading) return
  sleepFading = true
  const saved = audio.getVolume()
  const steps = 20, dur = 5000
  for (let i = steps; i >= 0; i--) {
    audio.setVolume((saved * i) / steps)
    await new Promise(r => setTimeout(r, dur / steps))
  }
  await audio.pause()
  isPlaying = false
  btnPlay.textContent = '>'
  syncMiniPlay()
  audio.setVolume(saved)
  sleepFading = false
  pushRemoteState()
}

function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60), s = Math.floor(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function updateTimerUI() {
  const ps = pomodoro ? pomodoro.getState() : { phase: 'idle' }
  const pEl = $('pomo-display')
  if (pEl) {
    pEl.textContent = ps.phase === 'idle'
      ? 'Idle'
      : `${ps.kind === 'focus' ? 'FOCUS' : (ps.kind === 'long' ? 'LONG BREAK' : 'BREAK')} ${fmtClock(ps.remaining)}`
  }
  const sEl = $('sleep-display')
  if (sEl) sEl.textContent = sleepEndsAt ? `Sleep in ${fmtClock(Math.round(sleepRemainingMs() / 1000))}` : 'Sleep off'
}

function onSecond() {
  if (sleepEndsAt && sleepRemainingMs() <= 0) { sleepEndsAt = null; sleepFadeOutAndPause() }
  updateTimerUI()
  pushRemoteTick()
}

function buildRemoteState() {
  const t = playlist.currentTrack()
  const order = (settings.shuffle && shuffleQueue.length === playlist.tracks.length)
    ? shuffleQueue
    : playlist.tracks.map((_, i) => i)
  return {
    type: 'state',
    title: t ? (t.title || 'Unknown') : 'No track',
    artist: t ? (t.artist || '') : '',
    art: t && t._picture ? t._picture : null,
    isPlaying,
    elapsed: lastElapsed,
    duration: audio._duration || 0,
    volume: audio.getVolume(),
    shuffle: !!settings.shuffle,
    currentIndex: playlist.currentIndex,
    tracks: order.map(i => ({ index: i, title: playlist.tracks[i].title, artist: playlist.tracks[i].artist })),
    queue: requestQueue.slice(),
    sleep: { active: !!sleepEndsAt, remaining: Math.round(sleepRemainingMs() / 1000) },
    pomodoro: pomodoro ? pomodoro.getState() : { phase: 'idle' },
  }
}
function buildRemoteTick() {
  return {
    type: 'tick', isPlaying, elapsed: lastElapsed, duration: audio._duration || 0, volume: audio.getVolume(),
    sleep: { active: !!sleepEndsAt, remaining: Math.round(sleepRemainingMs() / 1000) },
    pomodoro: pomodoro ? pomodoro.getState() : { phase: 'idle' },
  }
}
function pushRemoteState() { window.saikouAPI.sendRemoteState(buildRemoteState()) }
function pushRemoteTick()  { window.saikouAPI.sendRemoteState(buildRemoteTick()) }

function handleRemoteCommand(cmd) {
  switch (cmd.action) {
    case 'toggle': btnPlay.click(); break
    case 'play':   if (!isPlaying) btnPlay.click(); break
    case 'pause':  if (isPlaying) btnPlay.click(); break
    case 'next':   $('btn-next').click(); break
    case 'prev':   $('btn-prev').click(); break
    case 'shuffle': btnShuffle.click(); break
    case 'seek':   if (typeof cmd.value === 'number') audio.seekTo(cmd.value * (audio._duration || 0)); break
    case 'volume': if (typeof cmd.value === 'number') applyVolume(cmd.value, true); break
    case 'play-index':
      if (Number.isInteger(cmd.index) && playlist.tracks[cmd.index]) {
        if (settings.shuffle) shufflePos = shuffleQueue.indexOf(cmd.index)
        playTrackAt(cmd.index)
      }
      break
    case 'djbreak':
      if (playlist.tracks.length) { breakPending = true; $('btn-next').click() }
      break
    case 'queue-add':
      if (Number.isInteger(cmd.index) && playlist.tracks[cmd.index]) { requestQueue.push(cmd.index); pushRemoteState() }
      break
    case 'queue-remove':
      if (Number.isInteger(cmd.index)) { const p = requestQueue.indexOf(cmd.index); if (p >= 0) requestQueue.splice(p, 1); pushRemoteState() }
      break
    case 'sleep-set': setSleep(Number(cmd.minutes) || 0); break
    case 'pomo-start': if (pomodoro) pomodoro.start(); break
    case 'pomo-pause': if (pomodoro) pomodoro.pause(); break
    case 'pomo-reset': if (pomodoro) pomodoro.reset(); break
    case 'pomo-skip':  if (pomodoro) pomodoro.skip(); break
  }
  pushRemoteState()
}

audio.onTrackEnd(async () => {
  if (breakPending) {
    await runDJBreak()
    await playNext()
  } else {
    await playNext()
  }
})

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

audio.onTimeUpdate((elapsed, duration) => {
  lastElapsed = elapsed
  if (duration > 0) {
    const pct = (elapsed / duration) * 100
    if (!seekDragging) {
      seekSlider.value = Math.round((elapsed / duration) * 1000)
      seekSlider.style.setProperty('--seek-pct', `${pct.toFixed(1)}%`)
    }
    const timeStr = `${formatTime(elapsed)} / ${formatTime(duration)}`
    trackMeta.textContent = currentArtist ? `${currentArtist} · ${timeStr}` : timeStr
  }
})

seekSlider.addEventListener('mousedown', () => { seekDragging = true })
seekSlider.addEventListener('input', () => {
  seekSlider.style.setProperty('--seek-pct', `${(seekSlider.value / 10).toFixed(1)}%`)
})
seekSlider.addEventListener('mouseup', () => {
  seekDragging = false
  const frac = seekSlider.value / 1000
  audio.seekTo(frac * audio._duration)
})
seekSlider.addEventListener('touchstart', () => { seekDragging = true })
seekSlider.addEventListener('touchend', () => {
  seekDragging = false
  const frac = seekSlider.value / 1000
  audio.seekTo(frac * audio._duration)
})

// --- Countdown display ---
function startCountdownDisplay() {
  if (countdownIntervalId) clearInterval(countdownIntervalId)
  countdownIntervalId = setInterval(() => {
    if (!scheduler) return
    const ms = scheduler.remainingMs()
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    djCountdown.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    if (fsCountdown) fsCountdown.textContent = djCountdown.textContent
  }, 1000)
}

// --- Controls ---
$('btn-prev').onclick = () => {
  if (!playlist.tracks || playlist.tracks.length === 0) return
  const idx = Math.max(0, playlist.currentIndex - 1)
  playTrackAt(idx)
}

btnPlay.onclick = async () => {
  if (!playlist.tracks || playlist.tracks.length === 0) return
  if (isPlaying) {
    await audio.pause()
    isPlaying = false
    btnPlay.textContent = '>'
    syncMiniPlay()
    pushRemoteState()
  } else {
    await audio.resume()
    isPlaying = true
    btnPlay.textContent = '||'
    syncMiniPlay()
    pushRemoteState()
  }
}

$('btn-next').onclick = async () => {
  if (!playlist.tracks || playlist.tracks.length === 0) return
  if (breakPending) {
    await runDJBreak()
    await playNext()
  } else {
    await playNext()
  }
}

$('open-btn').onclick = async () => {
  const paths = await window.saikouAPI.openPlaylists()
  await loadPlaylists(paths, { append: true })
}

const clearBtn = $('clear-btn')
if (clearBtn) clearBtn.onclick = () => clearPlaylists()

$('settings-btn').onclick = () => window.saikouAPI.openSettingsWindow()

btnMono.onclick = () => {
  monoEnabled = !monoEnabled
  audio.setMono(monoEnabled)
  btnMono.textContent = monoEnabled ? 'Mono' : 'Stereo'
  btnMono.classList.toggle('active', monoEnabled)
}

btnShuffle.onclick = () => {
  settings.shuffle = !settings.shuffle
  btnShuffle.classList.toggle('active', settings.shuffle)
  if (settings.shuffle && playlist.tracks.length > 1) {
    buildShuffleQueue(playlist.currentIndex)
  }
  renderPlaylist()
  pushRemoteState()
}

$('fullscreen-btn').onclick = toggleFullscreen
$('remote-btn').onclick = async () => {
  const info = await window.saikouAPI.getRemoteInfo()
  const overlay = $('remote-overlay')
  const qr = $('remote-qr'), urlEl = $('remote-url'), msg = $('remote-msg')
  if (info && info.running) {
    urlEl.textContent = info.url
    if (info.qr) { qr.src = info.qr; qr.style.display = 'block' } else { qr.style.display = 'none' }
    msg.textContent = 'Open this address on a device on the same Wi‑Fi.'
  } else {
    urlEl.textContent = ''
    qr.style.display = 'none'
    msg.textContent = 'Remote is off. Enable it in Settings → Remote (LAN).'
  }
  overlay.classList.add('show')
}
$('remote-close').onclick = () => $('remote-overlay').classList.remove('show')
$('remote-overlay').onclick = (e) => { if (e.target === $('remote-overlay')) $('remote-overlay').classList.remove('show') }
$('timers-btn').onclick = () => { updateTimerUI(); $('timers-overlay').classList.add('show') }
$('timers-close').onclick = () => $('timers-overlay').classList.remove('show')
$('timers-overlay').onclick = (e) => { if (e.target === $('timers-overlay')) $('timers-overlay').classList.remove('show') }
$('library-btn').onclick = async () => {
  const items = await window.saikouAPI.listLibrary()
  const list = $('library-list')
  list.innerHTML = ''
  if (!items || items.length === 0) {
    const e = document.createElement('div')
    e.className = 'lib-empty'
    e.textContent = 'No playlists found. Set a Playlists Folder in Settings.'
    list.appendChild(e)
  } else {
    items.forEach(it => {
      const b = document.createElement('button')
      b.className = 'lib-item'
      b.textContent = it.name
      b.onclick = async () => { $('library-overlay').classList.remove('show'); await loadPlaylists([it.path], { append: true }) }
      list.appendChild(b)
    })
  }
  $('library-overlay').classList.add('show')
}
$('library-close').onclick = () => $('library-overlay').classList.remove('show')
$('library-overlay').onclick = (e) => { if (e.target === $('library-overlay')) $('library-overlay').classList.remove('show') }
document.querySelectorAll('#timers-card [data-sleep]').forEach(b => {
  b.onclick = () => setSleep(parseInt(b.getAttribute('data-sleep'), 10))
})
$('pomo-start').onclick = () => { if (pomodoro) pomodoro.start() }
$('pomo-pause').onclick = () => { if (pomodoro) pomodoro.pause() }
$('pomo-skip').onclick  = () => { if (pomodoro) pomodoro.skip() }
$('pomo-reset').onclick = () => { if (pomodoro) pomodoro.reset() }
$('fs-exit').onclick = exitFullscreen
$('fs-prev').onclick = () => $('btn-prev').click()
$('fs-play').onclick = () => btnPlay.click()
$('fs-next').onclick = () => $('btn-next').click()
$('fs-cycle').onclick = cycleVisualizer

document.addEventListener('mousemove', () => { if (isFullscreen) armChromeHide() })
window.addEventListener('resize', () => { if (visualizer) visualizer.resize() })

document.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
  switch (e.key) {
    case ' ':          e.preventDefault(); btnPlay.click(); break
    case 'ArrowLeft':  $('btn-prev').click(); break
    case 'ArrowRight': $('btn-next').click(); break
    case 'ArrowUp':    e.preventDefault(); applyVolume(audio.getVolume() + 0.05, true); break
    case 'ArrowDown':  e.preventDefault(); applyVolume(audio.getVolume() - 0.05, true); break
    case 'f': case 'F': toggleFullscreen(); break
    case 'Escape':     exitFullscreen(); break
    case 'v': case 'V': if (isFullscreen) cycleVisualizer(); break
  }
})

// Settings window triggers a reload via IPC relay through main process
const { ipcRenderer } = require('electron')
ipcRenderer.on('settings:reload', () => loadSettings())

// --- Mini mode ---
const miniMarquee = $('mini-marquee')
const miniArtImg = $('mini-art-img')
const miniArtPlaceholder = $('mini-art-placeholder')

function syncMiniTrack() {
  const t = playlist.currentTrack()
  if (!t) return
  const label = (t.artist ? `${t.artist} - ` : '') + t.title
  miniMarquee.textContent = label
  // Only animate if text is likely to overflow
  miniMarquee.classList.toggle('short', label.length < 36)
  // Album art
  if (t._picture) {
    miniArtImg.src = t._picture
    miniArtImg.classList.add('visible')
    miniArtPlaceholder.style.display = 'none'
  } else {
    miniArtImg.classList.remove('visible')
    miniArtPlaceholder.style.display = ''
  }
}

function syncMiniPlay() {
  $('mini-play').textContent = isPlaying ? '||' : '>'
}

$('mini-btn').onclick = async () => {
  document.body.classList.add('mini')
  syncMiniTrack()
  await window.saikouAPI.setMiniMode(true)
}

$('mini-prev').onclick = () => $('btn-prev').click()
$('mini-play').onclick = () => $('btn-play').click()
$('mini-next').onclick = () => $('btn-next').click()

$('mini-expand').onclick = async () => {
  document.body.classList.remove('mini')
  await window.saikouAPI.setMiniMode(false)
}



// --- Remote control ---
window.saikouAPI.onRemoteCommand(handleRemoteCommand)
setInterval(onSecond, 1000)

// --- Init ---
loadSettings()
