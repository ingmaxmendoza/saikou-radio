// renderer/app.js
const { PlaylistManager } = require('./playlist')
const { AudioPlayer } = require('./audio')
const { BreakScheduler } = require('./scheduler')
const { DJEngine } = require('./dj')
const { ThemeEngine } = require('./theme')
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
}

if (volumeSlider) volumeSlider.addEventListener('input', () => applyVolume(volumeSlider.value / 100, true))
if (fsVolume) fsVolume.addEventListener('input', () => applyVolume(fsVolume.value / 100, true))

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
  btnShuffle.classList.toggle('active', !!settings.shuffle)
}

// --- Playlist rendering ---
function renderPlaylist() {
  playlistList.innerHTML = ''
  const order = (settings.shuffle && shuffleQueue.length === playlist.tracks.length)
    ? shuffleQueue
    : playlist.tracks.map((_, i) => i)

  order.forEach(i => {
    const t = playlist.tracks[i]
    const isActive = i === playlist.currentIndex
    const div = document.createElement('div')
    div.className = 'pl-track' + (t.error ? ' error' : '') + (isActive ? ' active' : '')
    div.textContent = (isActive ? '► ' : '') + (t.artist ? `${t.artist} - ${t.title}` : t.title)
    div.onclick = () => {
      if (settings.shuffle) shufflePos = shuffleQueue.indexOf(i)
      playTrackAt(i)
    }
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
  syncMiniTrack()
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
  } catch (err) {
    console.error('playTrackAt error:', err)
    if (track) { track.error = true; djStatus.textContent = `Skip: ${err.message}` }
    failedTracks.add(index)
    renderPlaylist()
    await playNext()
  }
}

async function playNext() {
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
      if (settings.shuffle && shuffleQueue.length > 0) {
        const nextPos = shufflePos + 1
        const nextIdx = nextPos < shuffleQueue.length ? shuffleQueue[nextPos] : shuffleQueue[0]
        return playlist.tracks[nextIdx] ?? null
      }
      return playlist.tracks[(playlist.currentIndex + 1) % playlist.tracks.length] ?? null
    },
    onError: (msg) => { djStatus.textContent = `TTS error: ${msg}` },
  })
  await dj.runBreak()
  djStatus.textContent = ''
  if (scheduler) scheduler.reset()
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
  } else {
    await audio.resume()
    isPlaying = true
    btnPlay.textContent = '||'
    syncMiniPlay()
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
  try {
    const filePath = await window.saikouAPI.openFileDialog()
    if (!filePath) return
    const bytes = await window.saikouAPI.readFileAsBuffer(filePath)
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes))
    const text = new TextDecoder().decode(buf)
    playlist.loadFromText(text, filePath)
    failedTracks.clear()
    renderPlaylist()
    if (playlist.tracks.length === 0) {
      djStatus.textContent = 'No tracks found in playlist.'
      return
    }

    // Lock UI during metadata load
    const openBtn = $('open-btn')
    openBtn.disabled = true
    trackTitle.textContent = 'Loading playlist...'
    trackMeta.textContent = ''

    const total = playlist.tracks.length
    let loaded = 0
    djStatus.textContent = `0 / ${total}`

    const BATCH = 8
    for (let i = 0; i < total; i += BATCH) {
      await Promise.all(playlist.tracks.slice(i, i + BATCH).map(async (track) => {
        try {
          const meta = await window.saikouAPI.readMetadata(track.path)
          if (meta.title)  track.title  = meta.title
          if (meta.artist) track.artist = meta.artist
          track._picture = meta.picture
        } catch {}
        loaded++
        djStatus.textContent = `${loaded} / ${total}`
      }))
      renderPlaylist()
    }

    openBtn.disabled = false
    djStatus.textContent = ''
    if (settings.shuffle && playlist.tracks.length > 1) buildShuffleQueue(0)
    if (scheduler) scheduler.stop()
    scheduler = new BreakScheduler(settings.breakInterval, () => { breakPending = true })
    scheduler.start()
    startCountdownDisplay()
    await playTrackAt(settings.shuffle ? shuffleQueue[0] : 0)
  } catch (err) {
    $('open-btn').disabled = false
    djStatus.textContent = `Error: ${err.message}`
    console.error('open-btn error:', err)
  }
}

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
}

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



// --- Init ---
loadSettings()
