// renderer/audio.js

function clampVolume(v) {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1
}

class AudioPlayer {
  constructor() {
    this._ctx = new AudioContext()
    this._masterGain = this._ctx.createGain()    // master volume
    this._analyser = this._ctx.createAnalyser()
    this._analyser.fftSize = 2048
    this._analyser.smoothingTimeConstant = 0.8
    // source -> [mono] -> sourceGain (per-source fades) -> masterGain -> analyser -> destination
    this._masterGain.connect(this._analyser)
    this._analyser.connect(this._ctx.destination)
    this._volume = 1
    this._masterGain.gain.value = 1
    this._source = null
    this._sourceGain = null
    this._currentAudioBuffer = null
    this._onTrackEndCb = null
    this._onCrossfadeCb = null
    this._onTimeUpdateCb = null
    this._tickInterval = null
    this._startedAt = 0
    this._duration = 0
    this._fadeDuration = 2
    this._fadingOut = false
    this._mono = false
  }

  onTrackEnd(cb)       { this._onTrackEndCb = cb }
  onCrossfade(cb)      { this._onCrossfadeCb = cb }
  onTimeUpdate(cb)     { this._onTimeUpdateCb = cb }
  setFadeDuration(s)   { this._fadeDuration = s >= 0 ? s : 0 }
  setMono(enabled)     { this._mono = !!enabled }
  setVolume(v)         { this._volume = clampVolume(v); this._masterGain.gain.setValueAtTime(this._volume, this._ctx.currentTime) }
  getVolume()          { return this._volume }
  getAnalyser()        { return this._analyser }

  async playFile(filePath) {
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

  // Retire the current source. Mid fade-out (crossfade) it rings out to its
  // scheduled silence and is stopped at the fade end; otherwise it's cut now.
  _retire() {
    clearInterval(this._tickInterval)
    this._tickInterval = null
    const s = this._source, g = this._sourceGain
    this._source = null
    this._sourceGain = null
    if (!s) return
    const cleanup = () => {
      try { s.disconnect() } catch {}
      if (g) try { g.disconnect() } catch {}
    }
    s.onended = cleanup
    if (this._fadingOut) {
      // ponytail: seeking inside the final fade window briefly overlaps the
      // same track with itself; harmless and rare, cut here if it ever annoys
      try { s.stop(this._ctx.currentTime + this._fadeDuration) } catch {}
    } else {
      try { s.stop() } catch {}
      cleanup()
    }
    this._fadingOut = false
  }

  _playBuffer(audioBuffer, emitEnd, onEnded, offset) {
    this._retire()
    this._currentAudioBuffer = audioBuffer
    this._duration = audioBuffer.duration

    const source = this._ctx.createBufferSource()
    source.buffer = audioBuffer
    const srcGain = this._ctx.createGain()
    srcGain.connect(this._masterGain)

    // Mono: downmix via a 1-channel gain node (auto upmixed to stereo at destination)
    if (this._mono) {
      const monoNode = this._ctx.createGain()
      monoNode.channelCount = 1
      monoNode.channelCountMode = 'explicit'
      monoNode.channelInterpretation = 'speakers'
      source.connect(monoNode)
      monoNode.connect(srcGain)
    } else {
      source.connect(srcGain)
    }

    if (this._ctx.state === 'suspended') this._ctx.resume()

    // _startedAt: the ctx time at which offset=0 would have played
    this._startedAt = this._ctx.currentTime - offset

    // Fade in (main tracks only, not TTS/jingles)
    const fd = this._fadeDuration
    if (emitEnd && fd > 0) {
      srcGain.gain.setValueAtTime(0, this._ctx.currentTime)
      srcGain.gain.linearRampToValueAtTime(1, this._ctx.currentTime + fd)
    } else {
      srcGain.gain.setValueAtTime(1, this._ctx.currentTime)
    }

    source.start(0, offset)
    this._source = source
    this._sourceGain = srcGain

    this._tickInterval = setInterval(() => {
      const elapsed = this._ctx.currentTime - this._startedAt
      if (this._onTimeUpdateCb) this._onTimeUpdateCb(elapsed, this._duration)

      const remaining = this._duration - elapsed
      if (emitEnd && fd > 0 && !this._fadingOut && remaining > 0 && remaining <= fd) {
        this._fadingOut = true
        srcGain.gain.cancelScheduledValues(this._ctx.currentTime)
        srcGain.gain.setValueAtTime(srcGain.gain.value, this._ctx.currentTime)
        srcGain.gain.linearRampToValueAtTime(0, this._ctx.currentTime + remaining)
        // Crossfade window open: let the app start the next track under this one.
        // If it declines (e.g. DJ break pending), the natural end event still fires.
        if (this._onCrossfadeCb) this._onCrossfadeCb()
      }
    }, 200)

    source.onended = () => {
      clearInterval(this._tickInterval)
      this._tickInterval = null
      this._source = null
      this._sourceGain = null
      try { source.disconnect() } catch {}
      try { srcGain.disconnect() } catch {}
      if (onEnded) onEnded()
      if (emitEnd && this._onTrackEndCb) this._onTrackEndCb()
    }
  }

  async pause()  { if (this._ctx.state === 'running')   await this._ctx.suspend() }
  async resume() { if (this._ctx.state === 'suspended') await this._ctx.resume()  }
}

module.exports = { AudioPlayer, clampVolume }
