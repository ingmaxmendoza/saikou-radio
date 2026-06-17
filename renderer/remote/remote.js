const state = { tracks: [], queue: [], title: '', artist: '', art: null, isPlaying: false, elapsed: 0, duration: 0, volume: 1, shuffle: false, currentIndex: -1, sleep: { active: false, remaining: 0 }, pomodoro: { phase: 'idle' } }
const $ = (id) => document.getElementById(id)
let seekDragging = false

function post(action, extra) {
  fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action }, extra || {})),
  }).catch(() => {})
}

function fmt(s) { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

function renderTimers() {
  const s = state.sleep || { active: false, remaining: 0 }
  document.getElementById('sleep-state').textContent = s.active ? fmt(s.remaining) : 'off'
  const p = state.pomodoro || { phase: 'idle' }
  const label = p.phase === 'idle' ? 'idle'
    : (p.kind === 'focus' ? 'FOCUS' : (p.kind === 'long' ? 'LONG' : 'BREAK')) + ' ' + fmt(p.remaining || 0)
  document.getElementById('pomo-state').textContent = label
}

function renderTick() {
  $('play').textContent = state.isPlaying ? '||' : '>'
  if (!seekDragging) {
    const frac = state.duration ? state.elapsed / state.duration : 0
    $('seek').value = Math.round(frac * 1000)
  }
  $('elapsed').textContent = fmt(state.elapsed)
  $('duration').textContent = fmt(state.duration)
  $('vol').value = Math.round((state.volume ?? 1) * 100)
  renderTimers()
}

function renderPlaylist() {
  const el = $('playlist')
  el.innerHTML = ''
  state.tracks.forEach((t) => {
    const row = document.createElement('div')
    row.className = 'tr' + (t.index === state.currentIndex ? ' active' : '')
    const name = document.createElement('div')
    name.className = 'name' + (t.index === state.currentIndex ? ' active' : '')
    name.textContent = (t.artist ? t.artist + ' - ' : '') + (t.title || 'Unknown')
    name.onclick = () => post('play-index', { index: t.index })
    const add = document.createElement('button')
    add.className = 'add'; add.textContent = '＋'
    add.onclick = () => post('queue-add', { index: t.index })
    row.appendChild(name); row.appendChild(add)
    el.appendChild(row)
  })
}

function renderQueue() {
  const sec = $('queue-section')
  const el = $('queue')
  el.innerHTML = ''
  if (!state.queue || state.queue.length === 0) { sec.classList.add('hidden'); return }
  sec.classList.remove('hidden')
  state.queue.forEach((idx) => {
    const t = state.tracks.find((x) => x.index === idx) || { title: 'Track ' + idx }
    const row = document.createElement('div')
    row.className = 'qtr'
    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = (t.artist ? t.artist + ' - ' : '') + (t.title || 'Unknown')
    const rm = document.createElement('button')
    rm.className = 'rm'; rm.textContent = '✕'
    rm.onclick = () => post('queue-remove', { index: idx })
    row.appendChild(name); row.appendChild(rm)
    el.appendChild(row)
  })
}

function renderFull() {
  $('title').textContent = state.title || 'No track'
  $('artist').textContent = state.artist || ''
  const art = $('art')
  if (state.art) { art.src = state.art; art.style.display = 'block' } else { art.style.display = 'none' }
  $('shuffle').classList.toggle('on', !!state.shuffle)
  renderPlaylist(); renderQueue(); renderTick(); renderTimers()
}

function pollState() {
  fetch('/api/state')
    .then((r) => r.json())
    .then((msg) => { Object.assign(state, msg); renderFull() })
    .catch(() => {})
}

function connect() {
  const es = new EventSource('/api/events')
  es.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg.type === 'tick') { Object.assign(state, msg); renderTick() }
    else { Object.assign(state, msg); renderFull() }
  }
  es.onerror = () => { /* EventSource auto-reconnects; poll to re-sync */ pollState() }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pollState()
})

$('play').onclick = () => post('toggle')
$('prev').onclick = () => post('prev')
$('next').onclick = () => post('next')
$('shuffle').onclick = () => post('shuffle')
$('djbreak').onclick = () => post('djbreak')
$('vol').oninput = () => post('volume', { value: $('vol').value / 100 })
$('seek').addEventListener('input', () => { seekDragging = true })
$('seek').addEventListener('change', () => { seekDragging = false; post('seek', { value: $('seek').value / 1000 }) })

document.querySelectorAll('#sleep-btns [data-sleep]').forEach((b) => {
  b.onclick = () => post('sleep-set', { minutes: Number(b.getAttribute('data-sleep')) })
})
document.getElementById('p-start').onclick = () => post('pomo-start')
document.getElementById('p-pause').onclick = () => post('pomo-pause')
document.getElementById('p-skip').onclick  = () => post('pomo-skip')
document.getElementById('p-reset').onclick = () => post('pomo-reset')

connect()
