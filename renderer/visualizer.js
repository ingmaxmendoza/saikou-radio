// renderer/visualizer.js

const STYLE_NAMES = ['bars', 'scope', 'radial', 'particles']

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
    if (!analyser) return
    if (this._style === 'scope') this._drawScope(analyser, W, H)
    else if (this._style === 'radial') this._drawRadial(analyser, W, H)
    else if (this._style === 'particles') this._drawParticles(analyser, W, H)
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
    ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
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
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const v = data[i * step] / 255
      const len = R * 0.3 + v * R * 2.4
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len))
      ctx.stroke()
    }
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
}

module.exports = { VisualizerEngine, STYLE_NAMES, nextStyleName, resolveThemeColor }
