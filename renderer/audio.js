// renderer/audio.js

class AudioPlayer {
  constructor() {
    this._ctx = new AudioContext()
    this._source = null
    this._onTrackEndCb = null
    this._onTimeUpdateCb = null
    this._tickInterval = null
    this._startedAt = 0
    this._duration = 0
  }

  onTrackEnd(cb) { this._onTrackEndCb = cb }
  onTimeUpdate(cb) { this._onTimeUpdateCb = cb }

  async playFile(filePath) {
    await this._stop()
    const bytes = await window.saikouAPI.readFileAsBuffer(filePath)
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer)
    this._playBuffer(audioBuffer, true)
  }

  async playBuffer(uint8Array) {
    const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)
    const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer)
    return new Promise((resolve) => {
      this._playBuffer(audioBuffer, false, resolve)
    })
  }

  _playBuffer(audioBuffer, emitEnd, onEnded) {
    if (this._source) {
      this._source.onended = null
      this._source.disconnect()
      this._source = null
    }
    clearInterval(this._tickInterval)

    this._duration = audioBuffer.duration
    this._startedAt = this._ctx.currentTime

    const source = this._ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this._ctx.destination)
    source.start(0)
    this._source = source

    this._tickInterval = setInterval(() => {
      if (this._onTimeUpdateCb) {
        this._onTimeUpdateCb(this._ctx.currentTime - this._startedAt, this._duration)
      }
    }, 500)

    source.onended = () => {
      clearInterval(this._tickInterval)
      this._tickInterval = null
      this._source = null
      if (onEnded) onEnded()
      if (emitEnd && this._onTrackEndCb) this._onTrackEndCb()
    }
  }

  async _stop() {
    if (this._source) {
      this._source.onended = null
      try { this._source.stop() } catch {}
      this._source.disconnect()
      this._source = null
    }
    clearInterval(this._tickInterval)
    this._tickInterval = null
  }

  async pause() {
    if (this._ctx.state === 'running') await this._ctx.suspend()
  }

  async resume() {
    if (this._ctx.state === 'suspended') await this._ctx.resume()
  }
}

module.exports = { AudioPlayer }
