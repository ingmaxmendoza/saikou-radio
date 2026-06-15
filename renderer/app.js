// renderer/app.js
const { PlaylistManager } = require('./playlist')
const { AudioPlayer } = require('./audio')
const { BreakScheduler } = require('./scheduler')
const { DJEngine } = require('./dj')
const { ThemeEngine } = require('./theme')
const fs = require('fs')
const path = require('path')

let settings = {}
let playAttempts = 0
let playlist = new PlaylistManager()
let audio = new AudioPlayer()
let theme = new ThemeEngine()
let scheduler = null
let isPlaying = false
let breakPending = false
let countdownIntervalId = null
let currentArtist = ''

// --- DOM refs ---
const $ = (id) => document.getElementById(id)
const trackTitle = $('track-title')
const trackMeta = $('track-meta')
const progressFill = $('progress-fill')
const playlistList = $('playlist-list')
const djCountdown = $('dj-countdown')
const djEngineEl = $('dj-engine')
const djJingles = $('dj-jingles')
const djStatus = $('dj-status')
const clockEl = $('clock')
const btnPlay = $('btn-play')
const albumArt = $('album-art')

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
}

// --- Playlist rendering ---
function renderPlaylist() {
  playlistList.innerHTML = ''
  playlist.tracks.forEach((t, i) => {
    const div = document.createElement('div')
    const isActive = i === playlist.currentIndex
    div.className = 'pl-track' + (t.error ? ' error' : '') + (isActive ? ' active' : '')
    div.textContent = (isActive ? '► ' : '') + (t.artist ? `${t.artist} - ${t.title}` : t.title)
    div.onclick = () => playTrackAt(i)
    playlistList.appendChild(div)
  })
}

function updateNowPlaying() {
  const t = playlist.currentTrack()
  if (!t) return
  trackTitle.textContent = t.title || 'Unknown'
  currentArtist = t.artist || ''
  trackMeta.textContent = currentArtist
  renderPlaylist()
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
}

// --- Playback ---
async function playTrackAt(index) {
  playAttempts++
  if (playAttempts > playlist.tracks.length) {
    playAttempts = 0
    return
  }
  playlist.jumpTo(index)
  const track = playlist.currentTrack()
  updateNowPlaying()
  showAlbumArt(track)
  try {
    playAttempts = 0
    await audio.playFile(track.path)
    isPlaying = true
    btnPlay.textContent = '⏸'
  } catch (err) {
    console.error('playTrackAt error:', err)
    if (track) { track.error = true; djStatus.textContent = `Skip: ${err.message}` }
    renderPlaylist()
    playNext()
  }
}

async function playNext() {
  playlist.advance(settings.loop)
  await playTrackAt(playlist.currentIndex)
}

audio.onTrackEnd(async () => {
  if (breakPending) {
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
      onError: (msg) => { djStatus.textContent = `TTS error: ${msg}` },
    })
    await dj.runBreak()
    djStatus.textContent = ''
    if (scheduler) scheduler.reset()
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
  if (duration > 0) {
    progressFill.style.width = `${(elapsed / duration) * 100}%`
    const timeStr = `${formatTime(elapsed)} / ${formatTime(duration)}`
    trackMeta.textContent = currentArtist ? `${currentArtist} · ${timeStr}` : timeStr
  }
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
    btnPlay.textContent = '▶'
  } else {
    await audio.resume()
    isPlaying = true
    btnPlay.textContent = '⏸'
  }
}

$('btn-next').onclick = playNext

$('open-btn').onclick = async () => {
  try {
    const filePath = await window.saikouAPI.openFileDialog()
    if (!filePath) return
    const bytes = await window.saikouAPI.readFileAsBuffer(filePath)
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes))
    const text = new TextDecoder().decode(buf)
    playlist.loadFromText(text, filePath)
    renderPlaylist()
    if (playlist.tracks.length === 0) {
      djStatus.textContent = 'No tracks found in playlist.'
      return
    }
    djStatus.textContent = 'Loading metadata...'
    // Load all track metadata upfront so playlist shows real names immediately
    await Promise.all(playlist.tracks.map(async (track) => {
      try {
        const meta = await window.saikouAPI.readMetadata(track.path)
        if (meta.title)  track.title  = meta.title
        if (meta.artist) track.artist = meta.artist
        track._picture = meta.picture  // cache for when track plays
      } catch {}
    }))
    renderPlaylist()
    djStatus.textContent = ''
    if (scheduler) scheduler.stop()
    scheduler = new BreakScheduler(settings.breakInterval, () => { breakPending = true })
    scheduler.start()
    startCountdownDisplay()
    await playTrackAt(0)
  } catch (err) {
    djStatus.textContent = `Error: ${err.message}`
    console.error('open-btn error:', err)
  }
}

$('settings-btn').onclick = () => window.saikouAPI.openSettingsWindow()

// Settings window triggers a reload via IPC relay through main process
const { ipcRenderer } = require('electron')
ipcRenderer.on('settings:reload', () => loadSettings())

// --- Init ---
loadSettings()
