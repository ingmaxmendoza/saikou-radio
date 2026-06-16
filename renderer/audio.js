// renderer/audio.js

class AudioPlayer {
  constructor() {
    this._ctx = new AudioContext()
    this._gainNode = this._ctx.createGain()
    this._gainNode.connect(this._ctx.destination)
    this._source = null
    this._currentAudioBuffer = null
    this._onTrackEndCb = null
    this._onTimeUpdateCb = null
    this._tickInterval = null
    this._startedAt = 0   // ctx.currentTime at which offset-0 would have started
    this._duration = 0
    this._fadeDuration = 2
    this._fadingOut = false
    this._mono = false
  }

  onTrackEnd(cb)       { this._onTrackEndCb = cb }
  onTimeUpdate(cb)     { this._onTimeUpdateCb = cb }
  setFadeDuration(s)   { this._fadeDuration = s >= 0 ? s : 0 }
  setMono(enabled)     { this._mono = !!enabled }

  async playFile(filePath) {
    await this._stop()
    const bytes = await window.saikouAPI.readFileAsBuffer(filePath)
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer)
    this._playBuffer(audioBuffer, true, null, 0)
  }

  async playBuffer(uint8Array) {
    const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength)
    const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer)
    return new Promise((resolve) => {
      this._playBuffer(audioBuffer, false, resolve, 0)
    })
  }

  seekTo(time) {
    if (!this._currentAudioBuffer) return
    const t = Math.max(0, Math.min(time, this._currentAudioBuffer.duration - 0.05))
    this._playBuffer(this._currentAudioBuffer, true, null, t)
  }

  _playBuffer(audioBuffer, emitEnd, onEnded, offset) {
    if (this._source) {
      this._source.onended = null
      try { this._source.stop() } catch {}
      this._source.disconnect()
      this._source = null
    }
    clearInterval(this._tickInterval)
    this._fadingOut = false
    this._currentAudioBuffer = audioBuffer
    this._duration = audioBuffer.duration

    const source = this._ctx.createBufferSource()
    source.buffer = audioBuffer

    // Mono: downmix via a 1-channel gain node (auto upmixed to stereo at destination)
    if (this._mono) {
      const monoNode = this._ctx.createGain()
      monoNode.channelCount = 1
      monoNode.channelCountMode = 'explicit'
      monoNode.channelInterpretation = 'speakers'
      source.connect(monoNode)
      monoNode.connect(this._gainNode)
    } else {
      source.connect(this._gainNode)
    }

    if (this._ctx.state === 'suspended') this._ctx.resume()

    // _startedAt: the ctx time at which offset=0 would have played
    this._startedAt = this._ctx.currentTime - offset

    // Fade in (main tracks only, not TTS/jingles)
    const fd = this._fadeDuration
    if (emitEnd && fd > 0) {
      this._gainNode.gain.cancelScheduledValues(this._ctx.currentTime)
      this._gainNode.gain.setValueAtTime(0, this._ctx.currentTime)
      this._gainNode.gain.linearRampToValueAtTime(1, this._ctx.currentTime + fd)
    } else {
      this._gainNode.gain.cancelScheduledValues(this._ctx.currentTime)
      this._gainNode.gain.setValueAtTime(1, this._ctx.currentTime)
    }

    source.start(0, offset)
    this._source = source

    this._tickInterval = setInterval(() => {
      const elapsed = this._ctx.currentTime - this._startedAt
      if (this._onTimeUpdateCb) this._onTimeUpdateCb(elapsed, this._duration)

      const remaining = this._duration - elapsed
      if (emitEnd && fd > 0 && !this._fadingOut && remaining > 0 && remaining <= fd) {
        this._fadingOut = true
        this._gainNode.gain.cancelScheduledValues(this._ctx.currentTime)
        this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, this._ctx.currentTime)
        this._gainNode.gain.linearRampToValueAtTime(0, this._ctx.currentTime + remaining)
      }
    }, 200)

    source.onended = () => {
      clearInterval(this._tickInterval)
      this._tickInterval = null
      this._source = null
      if (onEnded) onEnded()
      if (emitEnd && this._onTrackEndCb) this._onTrackEndCb()
    }
  }

  async _stop() {
    this._gainNode.gain.cancelScheduledValues(this._ctx.currentTime)
    this._gainNode.gain.setValueAtTime(1, this._ctx.currentTime)
    if (this._source) {
      this._source.onended = null
      try { this._source.stop() } catch {}
      this._source.disconnect()
      this._source = null
    }
    clearInterval(this._tickInterval)
    this._tickInterval = null
  }

  async pause()  { if (this._ctx.state === 'running')   await this._ctx.suspend() }
  async resume() { if (this._ctx.state === 'suspended') await this._ctx.resume()  }
}

module.exports = { AudioPlayer }
