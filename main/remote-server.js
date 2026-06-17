// main/remote-server.js
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

function getLanIp(interfaces) {
  const ifaces = interfaces || os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

function parseCommand(body) {
  try {
    const obj = JSON.parse(body)
    if (obj && typeof obj === 'object' && typeof obj.action === 'string') return obj
  } catch {}
  return null
}

const REMOTE_DIR = path.join(__dirname, '../renderer/remote')
const THEMES_DIR = path.join(__dirname, '../themes')
const STATIC = {
  '/':           { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/remote.js':  { file: 'remote.js',  type: 'text/javascript; charset=utf-8' },
  '/remote.css': { file: 'remote.css', type: 'text/css; charset=utf-8' },
}

class RemoteServer {
  constructor({ onCommand } = {}) {
    this._onCommand = onCommand || (() => {})
    this._server = null
    this._clients = new Set()
    this._lastState = {}
    this._port = 7000
    this._themeName = 'dark-lcd'
    this._customThemePath = null
  }

  setTheme(name, customPath) {
    this._themeName = name || 'dark-lcd'
    this._customThemePath = customPath || null
  }

  isRunning() { return !!this._server }
  getPort() { return this._port }
  getUrl() { return `http://${getLanIp()}:${this._port}` }

  start(port) {
    if (this._server) return
    this._port = port || 7000
    this._server = http.createServer((req, res) => this._handle(req, res))
    this._server.on('error', (err) => { console.error('[RemoteServer]', err.message) })
    this._server.listen(this._port, '0.0.0.0')
  }

  stop() {
    if (!this._server) return
    for (const c of this._clients) { try { c.end() } catch {} }
    this._clients.clear()
    try { this._server.close() } catch {}
    this._server = null
  }

  broadcastState(state) {
    this._lastState = state || {}
    const payload = `data: ${JSON.stringify(this._lastState)}\n\n`
    for (const c of this._clients) { try { c.write(payload) } catch {} }
  }

  _handle(req, res) {
    const url = (req.url || '/').split('?')[0]
    if (req.method === 'GET' && url === '/api/events') return this._sse(req, res)
    if (req.method === 'GET' && url === '/api/state') return this._state(res)
    if (req.method === 'POST' && url === '/api/command') return this._command(req, res)
    if (req.method === 'GET' && url === '/theme.css') return this._serveThemeCss(res)
    if (req.method === 'GET' && STATIC[url]) return this._static(res, STATIC[url])
    res.writeHead(404); res.end('Not found')
  }

  _static(res, entry) {
    fs.readFile(path.join(REMOTE_DIR, entry.file), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': entry.type }); res.end(data)
    })
  }

  _sse(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    res.write('retry: 3000\n\n')
    res.write(`data: ${JSON.stringify(this._lastState)}\n\n`)
    this._clients.add(res)
    req.on('close', () => { this._clients.delete(res) })
    // Ask the renderer for a fresh state push so new clients get current data immediately
    try { this._onCommand({ action: 'request-state' }) } catch {}
  }

  _state(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(this._lastState))
  }

  _serveThemeCss(res) {
    const filePath = (this._themeName === 'custom' && this._customThemePath)
      ? this._customThemePath
      : path.join(THEMES_DIR, `${this._themeName || 'dark-lcd'}.css`)
    fs.readFile(filePath, (err, data) => {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
      res.end(err ? '' : data)
    })
  }

  _command(req, res) {
    let body = ''
    req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy() })
    req.on('end', () => {
      const cmd = parseCommand(body)
      if (!cmd) { res.writeHead(400); res.end('Bad command'); return }
      try { this._onCommand(cmd) } catch (e) { console.error('[RemoteServer] cmd', e.message) }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
    })
  }
}

module.exports = { RemoteServer, getLanIp, parseCommand }
