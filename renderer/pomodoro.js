// renderer/pomodoro.js

// Pure: given current phase + completed focus blocks, compute the next phase.
function nextPomodoroPhase(current, completedFocus, longEvery) {
  const every = longEvery || 4
  if (current === 'focus') {
    const cf = completedFocus + 1
    return { phase: 'break', kind: (cf % every === 0) ? 'long' : 'short', completedFocus: cf }
  }
  return { phase: 'focus', kind: 'focus', completedFocus }
}

class PomodoroTimer {
  constructor({ onPhaseChange, onTick } = {}) {
    this._onPhaseChange = onPhaseChange || (() => {})
    this._onTick = onTick || (() => {})
    this._durations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 } // seconds
    this._longEvery = 4
    this._phase = 'idle'  // 'idle' | 'focus' | 'break'
    this._kind = 'idle'   // 'idle' | 'focus' | 'short' | 'long'
    this._completedFocus = 0
    this._remaining = 0
    this._running = false
    this._interval = null
  }

  configure({ focus, short, long, longEvery }) {
    this._durations = {
      focus: (focus || 25) * 60,
      short: (short || 5) * 60,
      long: (long || 15) * 60,
    }
    this._longEvery = longEvery || 4
  }

  getState() {
    return {
      phase: this._phase, kind: this._kind, remaining: this._remaining,
      running: this._running, completedFocus: this._completedFocus,
    }
  }

  _durationFor(phase, kind) {
    if (phase === 'focus') return this._durations.focus
    return kind === 'long' ? this._durations.long : this._durations.short
  }

  _enter(phase, kind) {
    this._phase = phase
    this._kind = kind
    this._remaining = this._durationFor(phase, kind)
    this._onPhaseChange({ phase, kind })
    this._onTick(this.getState())
  }

  start() {
    if (this._phase === 'idle') this._enter('focus', 'focus')
    if (this._running) return
    this._running = true
    this._interval = setInterval(() => this._tick(), 1000)
    this._onTick(this.getState())
  }

  pause() {
    this._running = false
    if (this._interval) { clearInterval(this._interval); this._interval = null }
    this._onTick(this.getState())
  }

  reset() {
    this._running = false
    if (this._interval) { clearInterval(this._interval); this._interval = null }
    this._phase = 'idle'; this._kind = 'idle'; this._completedFocus = 0; this._remaining = 0
    this._onTick(this.getState())
  }

  skip() {
    if (this._phase === 'idle') return
    this._advance()
  }

  _advance() {
    const n = nextPomodoroPhase(this._phase, this._completedFocus, this._longEvery)
    this._completedFocus = n.completedFocus
    this._enter(n.phase, n.kind)
  }

  _tick() {
    if (!this._running) return
    this._remaining -= 1
    if (this._remaining <= 0) { this._advance(); return }
    this._onTick(this.getState())
  }
}

module.exports = { PomodoroTimer, nextPomodoroPhase }
