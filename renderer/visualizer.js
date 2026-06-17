// renderer/visualizer.js

const STYLE_NAMES = ['bars', 'scope', 'radial', 'particles', 'waterfall', 'vu', 'starfield', 'plasma', 'aurora']

function nextStyleName(current, list = STYLE_NAMES) {
  const i = list.indexOf(current)
  return list[(i + 1) % list.length]
}

function resolveThemeColor(varName, fallback, getProp) {
  const read = getProp || ((name) => getComputedStyle(document.body).getPropertyValue(name))
  const v = (read(varName) || '').trim()
  return v || fallback
}

class VisualizerEngine {
  constructor(canvas, getAnalyser) {
    this._canvas = canvas
    this._ctx = canvas.getContext('2d')
    this._getAnalyser = getAnalyser
    this._style = 'bars'
    this._raf = null
    this._running = false
    this._peaks = []
    this._parts = Array.from({ length: 64 }, () => ({
      x: Math.random(), y: Math.random(), s: 0.3 + Math.random() * 0.7,
    }))
    this._colors = { accent: '#00e5ff', dim: '#88ccdd', bg: '#1a1a2e' }
    this._artImg = null
    this.refreshColors()
    this._vuLevels = [0, 0]
    this._vuPeaks = [0, 0]
    this._stars = Array.from({ length: 150 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      px: 0, py: 0,
    }))
    this._plasmaTime = 0
    this._auroraHistory = []
  }

  setArt(dataUrl) {
    if (!dataUrl) { this._artImg = null; return }
    const img = new Image()
    img.onload = () => { this._artImg = img }
    img.src = dataUrl
  }

  refreshColors() {
    this._colors.accent = resolveThemeColor('--text-accent', '#00e5ff')
    this._colors.dim = resolveThemeColor('--text-secondary', '#88ccdd')
    this._colors.bg = resolveThemeColor('--bg-lcd', '#1a1a2e')
  }

  setStyle(name) { if (STYLE_NAMES.includes(name)) this._style = name }
  nextStyle() { this._style = nextStyleName(this._style); return this._style }

  resize() {
    const r = this._canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this._canvas.width = Math.max(1, Math.floor(r.width * dpr))
    this._canvas.height = Math.max(1, Math.floor(r.height * dpr))
  }

  start() {
    if (this._running) return
    this._running = true
    this.resize()
    const loop = () => {
      if (!this._running) return
      this._draw()
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  stop() {
    this._running = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  }

  _freq(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    return data
  }

  _draw() {
    const analyser = this._getAnalyser && this._getAnalyser()
    const ctx = this._ctx
    const W = this._canvas.width, H = this._canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = 1
    if (!analyser) return
    if (this._style === 'scope') this._drawScope(analyser, W, H)
    else if (this._style === 'radial') this._drawRadial(analyser, W, H)
    else if (this._style === 'particles') this._drawParticles(analyser, W, H)
    else if (this._style === 'waterfall') this._drawWaterfall(analyser, W, H)
    else if (this._style === 'vu') this._drawVU(analyser, W, H)
    else if (this._style === 'starfield') this._drawStarfield(analyser, W, H)
    else if (this._style === 'plasma') this._drawPlasma(analyser, W, H)
    else if (this._style === 'aurora') this._drawAurora(analyser, W, H)
    else this._drawBars(analyser, W, H)
  }

  _drawBars(analyser, W, H) {
    const data = this._freq(analyser)
    const n = 48
    const step = Math.floor(data.length / 2 / n) || 1
    const bw = W / n
    const ctx = this._ctx
    if (this._peaks.length !== n) this._peaks = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      const v = data[i * step] / 255
      const h = v * H * 0.9
      const g = ctx.createLinearGradient(0, H, 0, H - h)
      g.addColorStop(0, this._colors.dim)
      g.addColorStop(1, this._colors.accent)
      ctx.fillStyle = g
      ctx.fillRect(i * bw + 1, H - h, bw - 2, h)
      this._peaks[i] = Math.max(this._peaks[i] - H * 0.005, h)
      ctx.fillStyle = this._colors.accent
      ctx.fillRect(i * bw + 1, H - this._peaks[i] - 3, bw - 2, 2)
    }
  }

  _drawScope(analyser, W, H) {
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    const ctx = this._ctx
    ctx.lineWidth = Math.max(2, W / 600)
    ctx.strokeStyle = this._colors.accent
    ctx.shadowBlur = 16
    ctx.shadowColor = this._colors.accent
    ctx.beginPath()
    const slice = W / data.length
    for (let i = 0; i < data.length; i++) {
      const y = (data[i] / 255) * H
      const x = i * slice
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  _drawRadial(analyser, W, H) {
    const data = this._freq(analyser)
    const ctx = this._ctx
    const cx = W / 2, cy = H / 2
    const R = Math.min(W, H) * 0.16
    const n = 64
    const step = Math.floor(data.length / 2 / n) || 1
    ctx.save()
    const clipR = Math.max(0, R - 4)
    ctx.beginPath(); ctx.arc(cx, cy, clipR, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
    if (this._artImg) {
      ctx.drawImage(this._artImg, cx - R, cy - R, R * 2, R * 2)
    } else {
      ctx.fillStyle = this._colors.bg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
      ctx.fillStyle = this._colors.accent
      ctx.font = `bold ${R}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('♪', cx, cy)
    }
    ctx.restore()
    ctx.strokeStyle = this._colors.accent
    ctx.lineWidth = Math.max(2, W / 500)
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const v = data[i * step] / 255
      const len = R * 0.3 + v * R * 2.4
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len))
    }
    ctx.stroke()
  }

  _drawParticles(analyser, W, H) {
    const data = this._freq(analyser)
    let bass = 0
    for (let i = 0; i < 8; i++) bass += data[i]
    bass = bass / (8 * 255)
    const ctx = this._ctx
    for (const p of this._parts) {
      const r = p.s * (W / 90) * (1 + bass * 1.5)
      const xx = p.x * W, yy = p.y * H
      const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r * 3)
      g.addColorStop(0, this._colors.accent)
      g.addColorStop(1, 'transparent')
      ctx.globalAlpha = 0.5 * p.s
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(xx, yy, r * 3, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  _drawWaterfall(analyser, W, H) {
    // Lazy-create/resize offscreen canvas
    if (!this._waterfallCanvas || this._waterfallCanvas.width !== W || this._waterfallCanvas.height !== H) {
      this._waterfallCanvas = document.createElement('canvas')
      this._waterfallCtx = this._waterfallCanvas.getContext('2d')
      this._waterfallCanvas.width = W
      this._waterfallCanvas.height = H
    }
    const wCtx = this._waterfallCtx
    // Shift existing content down 1 pixel
    wCtx.drawImage(this._waterfallCanvas, 0, 1)
    // Paint new frequency strip at top row
    const data = this._freq(analyser)
    const sliceW = W / data.length
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 255
      if (v < 0.01) continue
      wCtx.fillStyle = v > 0.75 ? this._colors.accent : this._colors.dim
      wCtx.globalAlpha = v * v
      wCtx.fillRect(Math.floor(i * sliceW), 0, Math.ceil(sliceW), 1)
    }
    wCtx.globalAlpha = 1
    this._ctx.drawImage(this._waterfallCanvas, 0, 0)
  }

  _drawVU(analyser, W, H) {
    const data = this._freq(analyser)
    // Compute RMS level from full spectrum
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += (data[i] / 255) ** 2
    const rms = Math.sqrt(sum / data.length)
    const target = Math.min(1, rms * 2.2)
    // Smooth and decay
    this._vuLevels[0] += (target - this._vuLevels[0]) * 0.4
    this._vuLevels[1] = this._vuLevels[0]
    this._vuPeaks[0] = Math.max(this._vuPeaks[0] - 0.008, this._vuLevels[0])
    this._vuPeaks[1] = this._vuPeaks[0]

    const ctx = this._ctx
    const segments = 20
    const barW = Math.floor(W * 0.28)
    const barH = Math.floor(H * 0.82)
    const segH = barH / segments
    const gap = Math.max(1, Math.floor(segH * 0.18))
    const topY = Math.floor((H - barH) / 2)

    const drawBar = (x, level, peak) => {
      for (let s = 0; s < segments; s++) {
        const segLevel = (segments - s) / segments
        const lit = level >= segLevel
        const peakSeg = Math.round(peak * segments)
        const isPeak = (segments - s) === peakSeg
        let color
        if (s < 2) color = this._colors.accent
        else if (s < 5) color = '#ffaa00'
        else color = this._colors.accent
        ctx.globalAlpha = (lit || isPeak) ? 1 : 0.12
        ctx.fillStyle = (lit || isPeak) ? color : this._colors.dim
        ctx.fillRect(x, topY + s * segH, barW, segH - gap)
      }
    }
    drawBar(Math.floor(W * 0.08), this._vuLevels[0], this._vuPeaks[0])
    drawBar(Math.floor(W * 0.64), this._vuLevels[1], this._vuPeaks[1])
    ctx.globalAlpha = 1
  }

  _drawStarfield(analyser, W, H) {
    const data = this._freq(analyser)
    let bass = 0
    for (let i = 0; i < 8; i++) bass += data[i]
    bass = bass / (8 * 255)

    const ctx = this._ctx
    const cx = W / 2, cy = H / 2
    const speed = 0.006 + bass * 0.022

    ctx.strokeStyle = this._colors.accent
    for (const s of this._stars) {
      // Save projected position before moving
      const opx = (s.x / s.z) * cx + cx
      const opy = (s.y / s.z) * cy + cy
      s.z -= speed
      if (s.z <= 0.01) {
        s.x = (Math.random() - 0.5) * 2
        s.y = (Math.random() - 0.5) * 2
        s.z = 1
        continue
      }
      const nx = (s.x / s.z) * cx + cx
      const ny = (s.y / s.z) * cy + cy
      if (nx < 0 || nx > W || ny < 0 || ny > H) {
        s.x = (Math.random() - 0.5) * 2
        s.y = (Math.random() - 0.5) * 2
        s.z = 1
        continue
      }
      const brightness = 1 - s.z
      ctx.globalAlpha = Math.min(1, brightness * 1.4)
      ctx.lineWidth = brightness * 2.5
      ctx.beginPath()
      ctx.moveTo(opx, opy)
      ctx.lineTo(nx, ny)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  _drawPlasma(analyser, W, H) {
    const data = this._freq(analyser)
    let energy = 0
    for (let i = 0; i < data.length; i++) energy += data[i]
    energy = energy / (data.length * 255)
    this._plasmaTime += 0.04 + energy * 0.08

    // Lazy-create low-res offscreen canvas (96×54)
    if (!this._plasmaOff) {
      this._plasmaOff = document.createElement('canvas')
      this._plasmaOff.width = 96
      this._plasmaOff.height = 54
    }
    const pw = 96, ph = 54
    const offCtx = this._plasmaOff.getContext('2d')
    const imgData = offCtx.createImageData(pw, ph)
    const px = imgData.data
    const t = this._plasmaTime

    // Parse accent hex → rgb
    const ac = this._colors.accent
    const ar = parseInt(ac.slice(1, 3), 16)
    const ag = parseInt(ac.slice(3, 5), 16)
    const ab = parseInt(ac.slice(5, 7), 16)

    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const v = (
          Math.sin(x * 0.32 + t) +
          Math.sin(y * 0.28 + t * 0.7) +
          Math.sin((x + y) * 0.2 + t * 1.3) +
          Math.sin(Math.sqrt(x * x + y * y) * 0.38 - t)
        ) * 0.25 + 0.5  // normalize 0..1
        const idx = (y * pw + x) * 4
        px[idx]     = Math.floor(ar * v)
        px[idx + 1] = Math.floor(ag * v)
        px[idx + 2] = Math.floor(ab * v + 60 * (1 - v))
        px[idx + 3] = 220
      }
    }
    offCtx.putImageData(imgData, 0, 0)
    this._ctx.drawImage(this._plasmaOff, 0, 0, W, H)
  }

  _drawAurora(analyser, W, H) {
    const buf = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buf)
    // Snapshot current waveform as floats in [-0.5, 0.5]
    const snap = new Float32Array(buf.length)
    for (let i = 0; i < buf.length; i++) snap[i] = buf[i] / 255 - 0.5
    this._auroraHistory.push(snap)
    if (this._auroraHistory.length > 6) this._auroraHistory.shift()

    const ctx = this._ctx
    const layers = this._auroraHistory.length
    const midY = H / 2

    for (let li = 0; li < layers; li++) {
      const wave = this._auroraHistory[li]
      const age = (li + 1) / layers   // 0→1: oldest→newest
      const slice = W / wave.length
      ctx.globalAlpha = 0.1 + age * 0.85
      ctx.lineWidth = 1 + age * 3
      ctx.strokeStyle = li % 2 === 0 ? this._colors.accent : this._colors.dim
      ctx.shadowBlur = age * 14
      ctx.shadowColor = this._colors.accent
      ctx.beginPath()
      for (let i = 0; i < wave.length; i++) {
        const x = i * slice
        const y = midY + wave[i] * H * 0.42
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }
}

module.exports = { VisualizerEngine, STYLE_NAMES, nextStyleName, resolveThemeColor }
