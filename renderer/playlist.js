// renderer/playlist.js
const path = require('path')

class PlaylistManager {
  constructor() {
    this.tracks = []
    this._index = 0
  }

  loadFromText(text, playlistPath) {
    const dir = path.dirname(playlistPath).replace(/\\/g, '/')
    const lines = text.split(/\r?\n/)
    this.tracks = []
    this._index = 0

    let pendingMeta = null

    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line === '#EXTM3U') continue

      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/^#EXTINF:(-?\d+),(.*)$/)
        if (match) {
          const duration = parseInt(match[1], 10)
          const info = match[2].trim()
          const dashIdx = info.indexOf(' - ')
          if (dashIdx !== -1) {
            pendingMeta = { duration, artist: info.slice(0, dashIdx).trim(), title: info.slice(dashIdx + 3).trim() }
          } else {
            pendingMeta = { duration, artist: '', title: info }
          }
        }
        continue
      }

      if (line.startsWith('#')) continue

      const isAbsolute = /^([A-Za-z]:[/\\]|\/)/.test(line)
      const filePath = isAbsolute ? line.replace(/\\/g, '/') : `${dir}/${line}`

      const fileName = path.basename(filePath)
      this.tracks.push({
        path: filePath,
        title: pendingMeta?.title ?? fileName,
        artist: pendingMeta?.artist ?? '',
        duration: pendingMeta?.duration ?? 0,
        error: false,
      })
      pendingMeta = null
    }
  }

  currentTrack() {
    return this.tracks[this._index] ?? null
  }

  advance(loop = true) {
    if (this.tracks.length === 0) return
    this._index++
    if (this._index >= this.tracks.length) {
      this._index = loop ? 0 : this.tracks.length - 1
    }
  }

  jumpTo(index) {
    if (index >= 0 && index < this.tracks.length) this._index = index
  }

  get currentIndex() {
    return this._index
  }
}

module.exports = { PlaylistManager }
