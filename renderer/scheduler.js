// renderer/scheduler.js
class BreakScheduler {
  constructor(intervalMinutes, onFire) {
    this._intervalMs = intervalMinutes * 60 * 1000
    this._onFire = onFire
    this._timer = null
    this._startedAt = null
  }

  start() {
    this.stop()
    this._startedAt = Date.now()
    this._timer = setTimeout(() => {
      this._timer = null
      this._startedAt = null
      this._onFire()
    }, this._intervalMs)
  }

  stop() {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._startedAt = null
  }

  reset() {
    this.stop()
    this.start()
  }

  remainingMs() {
    if (this._startedAt === null) return this._intervalMs
    const elapsed = Date.now() - this._startedAt
    return Math.max(0, this._intervalMs - elapsed)
  }
}

module.exports = { BreakScheduler }
