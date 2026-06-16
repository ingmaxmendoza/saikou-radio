# Saikou Radio

A Y2K-aesthetic desktop radio player built with Electron. Plays local audio playlists with automatic AI DJ voice breaks, multiple visual themes, a mini player mode, and full playback control. No streaming, no ads, no internet required for playback — everything runs locally.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [Main Process](#main-process)
5. [Renderer Process](#renderer-process)
6. [IPC Channels](#ipc-channels)
7. [Modules](#modules)
8. [Themes](#themes)
9. [DJ Engine & TTS](#dj-engine--tts)
10. [Fullscreen & Visualizers (V2 Phase 1)](#fullscreen--visualizers-v2-phase-1)
11. [LAN Remote (V2 Phase 2)](#lan-remote-v2-phase-2)
12. [Settings System](#settings-system)
13. [Mini Player](#mini-player)
14. [Playback Engine](#playback-engine)
15. [Playlist System](#playlist-system)
16. [Shuffle System](#shuffle-system)
17. [Metadata Loading](#metadata-loading)
18. [Build & Packaging](#build--packaging)
19. [Dependencies](#dependencies)
20. [Known Quirks](#known-quirks)

---

## Overview

| Property | Value |
|---|---|
| App name | Saikou Radio |
| Version | 2.0.0 |
| Platform | Windows (x64) |
| Runtime | Electron 31.7.7 |
| Entry point | `main/index.js` |
| Renderer entry | `renderer/index.html` |
| Window size | 760 × 440 px (fixed) |
| Mini player size | 480 × 100 px (fixed) |
| Node integration | Enabled (`nodeIntegration: true`, `contextIsolation: false`) |

---

## Architecture

```
┌──────────────────────────────────────┐
│           Main Process               │
│  main/index.js   ← entry point       │
│  main/ipc.js     ← all IPC handlers  │
│  main/tts.js     ← TTS synthesis     │
│  main/settings.js← settings store   │
│  main/preload.js ← window.saikouAPI  │
└──────────────┬───────────────────────┘
               │ IPC (invoke/send)
┌──────────────▼───────────────────────┐
│         Renderer Process             │
│  renderer/index.html  ← main UI      │
│  renderer/app.js      ← all UI logic │
│  renderer/playlist.js ← M3U parser   │
│  renderer/audio.js    ← Web Audio    │
│  renderer/scheduler.js← DJ timer     │
│  renderer/dj.js       ← script gen   │
│  renderer/theme.js    ← theme engine │
│  renderer/settings.html ← settings  │
│  renderer/settings-ui.js← settings  │
└──────────────────────────────────────┘
```

The app uses a single BrowserWindow with `frame: false` — no native OS chrome whatsoever. The titlebar, drag region, and controls are all custom HTML/CSS. `Menu.setApplicationMenu(null)` and `win.removeMenu()` are both called to fully suppress the Electron menu bar.

---

## File Structure

```
saikou/
├── main/
│   ├── index.js          # BrowserWindow creation, app lifecycle
│   ├── ipc.js            # All ipcMain handlers
│   ├── preload.js        # Exposes window.saikouAPI to renderer
│   ├── settings.js       # SettingsStore class + DEFAULTS
│   └── tts.js            # Edge TTS + SAPI synthesis
├── renderer/
│   ├── index.html        # Main player UI
│   ├── app.js            # All renderer logic
│   ├── audio.js          # AudioPlayer (Web Audio API)
│   ├── playlist.js       # PlaylistManager (M3U parser)
│   ├── scheduler.js      # BreakScheduler (DJ countdown)
│   ├── dj.js             # DJEngine + buildDJScript
│   ├── theme.js          # ThemeEngine
│   ├── settings.html     # Settings window UI
│   └── settings-ui.js    # Settings window logic
├── themes/
│   ├── y2k-silver.css
│   ├── dark-lcd.css
│   ├── blueberry-xp.css
│   ├── win98.css
│   ├── white-on-black.css
│   └── green-terminal.css
├── assets/
│   └── icon.png          # App icon (used for installer + taskbar)
├── tests/
│   └── dj.test.js        # Jest tests for buildDJScript
├── package.json
├── electron-builder.yml
└── .gitignore
```

---

## Main Process

### `main/index.js`

Entry point. Creates the BrowserWindow and registers IPC handlers.

```js
mainWindow = new BrowserWindow({
  width: 760, height: 440,
  resizable: false,
  frame: false,           // removes all native chrome
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
    preload: path.join(__dirname, 'preload.js'),
  }
})
```

- `frame: false` is critical — without it, the Windows menu bar cannot be fully suppressed
- `Menu.setApplicationMenu(null)` is called at module level as an extra precaution
- `win.removeMenu()` is also called after window creation
- Exports `getMainWindow()` for lazy access by `ipc.js` (avoids circular require)

### `main/preload.js`

Exposes `window.saikouAPI` — the only bridge between renderer and main. All renderer→main communication goes through this object.

```js
window.saikouAPI = {
  getSettings:       () => ipcRenderer.invoke('settings:get'),
  saveSettings:      (s) => ipcRenderer.invoke('settings:save', s),
  synthesizeTTS:     async (text, engine, voice) => { ... },
  openFileDialog:    (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openFolderDialog:  () => ipcRenderer.invoke('dialog:openFolder'),
  readFileAsBuffer:  (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readMetadata:      (filePath) => ipcRenderer.invoke('metadata:read', filePath),
  openSettingsWindow:() => ipcRenderer.invoke('window:openSettings'),
  listVoices:        (engine) => ipcRenderer.invoke('tts:listVoices', engine),
  setMiniMode:       (on) => ipcRenderer.invoke(on ? 'window:mini' : 'window:restore'),
}
```

**Buffer coercion note:** When IPC sends a Node `Buffer` back to the renderer, Electron serializes it as a plain object with numeric keys (e.g. `{ 0: 72, 1: 101, ... }`). The `synthesizeTTS` wrapper detects this and coerces it back to `Uint8Array` via `new Uint8Array(Object.values(buf))`.

---

## IPC Channels

All handlers are registered in `main/ipc.js`.

| Channel | Direction | Description |
|---|---|---|
| `settings:get` | invoke | Returns current settings object |
| `settings:save` | invoke | Merges partial settings and writes to disk |
| `settings:notify-reload` | send | Settings window → main; triggers relay to renderer |
| `settings:reload` | send | Main → renderer; triggers `loadSettings()` |
| `tts:synthesize` | invoke | Synthesizes TTS; returns raw audio Buffer |
| `tts:listVoices` | invoke | Returns available voices for Edge or SAPI engine |
| `dialog:openFile` | invoke | Opens native file picker; returns selected path or null |
| `dialog:openFolder` | invoke | Opens native folder picker; returns selected path or null |
| `fs:readFile` | invoke | Reads a file and returns its bytes; extension whitelist enforced |
| `metadata:read` | invoke | Reads audio metadata via `music-metadata`; returns title/artist/album/picture |
| `window:openSettings` | invoke | Creates (or focuses) the settings BrowserWindow |
| `window:mini` | invoke | Resizes window to 480×100, pins to bottom corner, enables always-on-top |
| `window:restore` | invoke | Restores window to 760×440, centers it, removes corner-snap listener |
| `window:fullscreen` | invoke | Enters OS fullscreen mode |
| `window:windowed` | invoke | Exits OS fullscreen mode, restores windowed state |
| `remote:state` | send | Renderer → main; push live state |
| `remote:command` | send | Main → renderer; deliver phone command |
| `remote:info` | invoke | Returns {running, url, qr} |

### File security (`fs:readFile`)

Only these extensions are allowed to be read:

```js
const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus',
  '.m3u', '.m3u8',
])
```

Any other extension throws an error and the read is blocked.

### Settings reload IPC flow

```
settings-ui.js
  → ipcRenderer.send('settings:notify-reload')
    → ipc.js: ipcMain.on('settings:notify-reload')
      → win.webContents.send('settings:reload')
        → app.js: ipcRenderer.on('settings:reload', loadSettings)
```

---

## Renderer Process

### `renderer/app.js`

All UI logic lives here. Key state:

```js
let settings = {}
const failedTracks = new Set()   // tracks that errored, prevents retry loops
let playlist = new PlaylistManager()
let audio = new AudioPlayer()
let theme = new ThemeEngine()
let scheduler = null
let isPlaying = false
let breakPending = false          // set true when DJ break timer fires
let countdownIntervalId = null
let currentArtist = ''
let monoEnabled = false
let seekDragging = false
let shuffleQueue = []             // Fisher-Yates ordered index list
let shufflePos = 0                // current position in shuffleQueue
```

---

## Modules

### `renderer/playlist.js` — PlaylistManager

Parses `.m3u` / `.m3u8` files.

- Handles both absolute paths (`C:\...`) and relative paths (resolved against the playlist file's directory)
- Parses `#EXTINF` tags for artist + title pre-population (format: `Artist - Title`)
- Strips unknown `#` comment lines
- Exposes: `loadFromText(text, playlistPath)`, `currentTrack()`, `advance(loop)`, `jumpTo(index)`, `currentIndex`

### `renderer/audio.js` — AudioPlayer

Built on the Web Audio API (`AudioContext`). All audio goes through a single `GainNode` for fade control.

**Key methods:**

| Method | Description |
|---|---|
| `playFile(filePath)` | Reads file via IPC, decodes, plays with fade-in/out |
| `playBuffer(uint8Array)` | Plays a raw audio buffer (used for TTS/jingles); returns a Promise that resolves on end |
| `seekTo(time)` | Seeks by stopping and restarting the buffer source at `offset` |
| `pause()` / `resume()` | Suspends/resumes the AudioContext |
| `setFadeDuration(s)` | Sets fade in/out duration in seconds (0 = instant) |
| `setMono(enabled)` | Enables mono downmix via a 1-channel intermediate GainNode |

**Fade logic:**
- On track start: gain ramps from 0 → 1 over `fadeDuration` seconds
- On track end: when `remaining <= fadeDuration`, gain ramps from current → 0
- TTS/jingles bypass fade (played via `playBuffer`, which sets `emitEnd = false`)

**Seek implementation:**
`_startedAt` stores `ctx.currentTime - offset`. Elapsed time = `ctx.currentTime - _startedAt`. Seek re-calls `_playBuffer` with the new offset, which stops the current source and starts a new one.

**Mono implementation:**
An intermediate `GainNode` with `channelCount: 1` and `channelCountMode: 'explicit'` is inserted between the source and the main gain node. This downmixes stereo to mono, then the audio graph upmixes it back to stereo at the destination.

**Time update tick:**
A `setInterval` at 200ms fires `onTimeUpdate(elapsed, duration)`. This drives the seek slider and the elapsed/duration display in the LCD.

### `renderer/scheduler.js` — BreakScheduler

Simple `setTimeout`-based timer that fires a callback after `intervalMinutes`. Supports `start()`, `stop()`, `reset()`, and `remainingMs()` (used for the countdown display).

### `renderer/theme.js` — ThemeEngine

Manages two `<link>` elements in `index.html`:

- `#base-98` — loads `98.css` from `node_modules`; only enabled for the `win98` theme
- `#theme-link` — loads the active theme CSS file

For custom themes, `href` is set to `file://` + the absolute path provided by the user. A cache-busting `?v=<timestamp>` is appended on every apply call.

---

## Themes

Six built-in themes, one custom option:

| ID | Name | Description |
|---|---|---|
| `y2k-silver` | Y2K Silver | Default. Silver/grey metallic, cyan LCD accents, Tahoma font |
| `dark-lcd` | Dark LCD | Near-black background, neon cyan accents, monospace |
| `blueberry-xp` | Blueberry XP | Deep blue UI, lighter blue accents, XP-era feel |
| `win98` | Windows 98 | Loads `98.css` base layer + custom overrides. MS Sans Serif / Fixedsys fonts, classic grey, navy titlebar gradient |
| `white-on-black` | White on Black | Pure black, white text, minimal borders, monospace |
| `green-terminal` | Green Terminal | #33ff33 green on near-black, CSS scanline effect via `body::before`, text-shadow glow |
| `custom` | Custom | User supplies a `.css` file path; loaded via `file://` URL |

All themes use CSS custom properties:

```css
--bg-primary       /* main window background */
--bg-secondary     /* titlebar, DJ panel */
--bg-panel         /* playlist sidebar */
--bg-lcd           /* LCD display background */
--text-primary     /* main text */
--text-secondary   /* dimmed text, labels */
--text-accent      /* highlight color (cyan, green, etc.) */
--border-light     /* raised border edge */
--border-dark      /* inset border edge */
--btn-bg           /* control button background */
--btn-text         /* control button text */
--font-ui          /* UI font */
--font-mono        /* monospace font */
```

**Win98 specifics:** The `98.css` library is loaded from `node_modules/98.css/dist/98.css`. Win98 theme overrides active button colors with `body .ctrl-btn.active { background: #000080 !important; color: #ffffff !important; }` — the `body` prefix is required for specificity over base styles that use `!important`.

---

## DJ Engine & TTS

### `renderer/dj.js`

The DJ script generator. Runs entirely in the renderer.

**`buildDJScript(currentTrack, nextTrack, timeStr, phrase, voice)`**

Constructs a natural-language DJ announcement. Template sections:

1. **Heard** — "You just heard [Title] by [Artist]." (5 variants per language)
2. **Next** — "Coming up next: [Title] by [Artist]." (4 variants; omitted if `nextTrack` is null)
3. **Time** — "It's [time]." (4 variants)
4. **Phrase** — Custom personality phrase from settings (non-empty only)
5. **Sign** — Fixed station sign-off ("You're listening to Saikou Radio.")

**Bilingual support:** `detectLang(voice)` checks if the voice name starts with `es-`. If so, Spanish templates and sign-off are used. English is the default.

**`pickPhrase(arr, lang)`** — Selects a personality phrase with history tracking. Maintains a per-language history of the last 5 picks and filters them out of the available pool to avoid repetition. Falls back to the full list when all phrases have been recently used.

**`DJEngine`** class (used in `app.js`):

```js
const dj = new DJEngine({
  playAudioBuffer: (buf) => audio.playBuffer(buf),
  playJingle: async (folder) => { /* picks random file from folder */ },
  synthesizeTTS: (text, engine, voice) => window.saikouAPI.synthesizeTTS(...),
  getSettings: () => settings,
  getPlaylist: () => playlist,
  onError: (msg) => { djStatus.textContent = `TTS error: ${msg}` },
})
await dj.runBreak()
```

**`runBreak()` flow:**
1. Gets current and next track from playlist
2. If jingles enabled and folder set, plays a random audio file from that folder
3. Detects language from `settings.ttsVoice`
4. Picks personality phrase (avoiding recent repeats)
5. Builds DJ script via `buildDJScript`
6. Synthesizes TTS via IPC → main process
7. Plays returned audio buffer
8. After completion, `scheduler.reset()` restarts the countdown

### `main/tts.js`

Handles actual speech synthesis in the main process.

**Edge TTS (`msedge-tts` package):**
- Uses Microsoft's unofficial Edge browser TTS API
- Format: `AUDIO_24KHZ_96KBITRATE_MONO_MP3`
- Returns a `Buffer` of MP3 data
- Requires internet connection
- Curated voice list of 10 EN/ES neural voices returned by `tts:listVoices`

**SAPI (Windows Speech API):**
- Runs a PowerShell script via `execSync` using `System.Speech.Synthesis.SpeechSynthesizer`
- Writes WAV to a temp file (`saikou-tts-<timestamp>.wav`), reads it, deletes it
- Fully offline; uses Windows installed voices
- Voice list retrieved by querying `$s.GetInstalledVoices()` via PowerShell

**Fallback behavior:** If Edge TTS is selected but fails (e.g., no internet), SAPI is used automatically. If the voice name contains "Neural" it's clearly an Edge voice name and won't work with SAPI, so `Microsoft Zira Desktop` is used as the SAPI fallback.

---

## Fullscreen & Visualizers (V2 Phase 1)

### `renderer/visualizer.js` — VisualizerEngine

Owns a `<canvas>` element and reads frequency/waveform data from an `AnalyserNode` supplied via a `getAnalyser` callback passed to the constructor.

**Visualizer styles (4 total):**

| Style | Description |
|---|---|
| `bars` | Classic frequency bar graph |
| `scope` | Oscilloscope waveform |
| `radial` | Radial/circular frequency display |
| `particles` | Particle system driven by audio amplitude |

**Color handling:** Colors are read live from the active theme's CSS custom properties (`--text-accent`, `--text-secondary`, `--bg-lcd`) via an internal `resolveThemeColor` helper that calls `getComputedStyle`. Colors are refreshed automatically when the theme changes.

**Key methods:**

| Method | Description |
|---|---|
| `start()` | Begins `requestAnimationFrame` render loop |
| `stop()` | Cancels the animation loop |
| `nextStyle()` | Cycles to the next visualizer style |
| `setStyle(name)` | Sets a specific style by name |
| `resize()` | Updates canvas dimensions to match its layout size |
| `setArt(dataUrl)` | Passes current album art for use in ambient background rendering |

### Audio Graph Changes (`renderer/audio.js`)

The audio graph was extended in V2 Phase 1:

```
source → [mono] → fadeGain → masterGain → analyser → destination
```

- `fadeGain` — the former single gain node; still handles fade in/out
- `masterGain` — new persistent master volume node; controlled via `setVolume(v)` / `getVolume()`; volume value is clamped by the exported `clampVolume` utility
- `analyser` — persistent `AnalyserNode` (fftSize 2048) inserted between `masterGain` and destination; exposed via `getAnalyser()` for `VisualizerEngine`

### Master Volume

- Persisted as the `volume` setting (range 0–1, default 1)
- Slider present in both the main player and the fullscreen bar
- Applied via `applyVolume()` in `app.js` which calls `audio.setVolume()`

### Fullscreen Mode

Real OS fullscreen via new IPC channels `window:fullscreen` / `window:windowed` (preload: `setFullscreen(true/false)`). DOM block `#fullscreen` in `index.html` is shown when active.

**Chrome auto-hide:** After ~3 seconds of no mouse movement in fullscreen, the class `body.chrome-hidden` is applied, hiding controls and cursor. Any mouse movement removes it.

**Entry/exit:** `F` key, or the fullscreen button in the player; handled by `enterFullscreen()` / `exitFullscreen()` in `app.js`. `Esc` also exits.

### Ambient Art Background & DJ Subtitles

| Feature | Setting key | Default | Description |
|---|---|---|---|
| Ambient art background | `ambientArtBackground` | `true` | Blurred album art rendered behind the visualizer canvas |
| DJ subtitles | `djSubtitles` | `true` | The spoken DJ line displayed large on-screen during a break, fed via the `DJEngine` `onScript` callback |

### Keyboard Shortcuts (Fullscreen & Global)

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `Left` | Previous track |
| `Right` | Next track |
| `Up` | Volume up |
| `Down` | Volume down |
| `F` | Enter fullscreen |
| `Esc` | Exit fullscreen |
| `V` | Cycle visualizer style |

### Visualizer Auto-Rotate

Optional: the visualizer style can automatically cycle every N tracks. Controlled by `visualizerAutoRotate` (bool) and `visualizerRotateEvery` (integer, number of tracks between rotations).

---

## LAN Remote (V2 Phase 2)

A zero-dependency HTTP server for controlling playback from a phone on the same LAN.

### `main/remote-server.js` — RemoteServer

A Node `http` server (no extra transport dependencies) with three route groups:

**Static routes (GET):**
- `GET /` → serves `renderer/remote/index.html`
- `GET /remote.js` → serves `renderer/remote/remote.js`
- `GET /remote.css` → serves `renderer/remote/remote.css`

**Event stream (SSE):**
- `GET /api/events` → Server-Sent Events stream. On connect, sends the cached full state `{type:'state',...}` with album art and metadata. After that, broadcasts full states on change and lightweight ticks (`{type:'tick',elapsed,duration,isPlaying,volume}`) approximately every second. Phone merges ticks into the last received full state.

**Command endpoint:**
- `POST /api/command` → Parses `{action,...}` JSON and invokes the `onCommand` callback, which relays to the renderer via IPC.

**Helpers:**
- `getLanIp(interfaces)` — Returns the first non-internal IPv4 address; falls back to `127.0.0.1`
- `parseCommand(body)` — Parses JSON and validates `action` is a string

**Core methods:**
- `start(port)` — Binds server to 0.0.0.0 and the given port (default 7000)
- `stop()` — Closes server and all SSE connections
- `broadcastState(state)` — Sends state to all connected clients
- `getUrl()` — Returns `http://<LAN-IP>:<port>`
- `isRunning()` — Returns whether server is active

**Lifecycle:**
Runs only when `remoteEnabled` is true (default false). Started/stopped in `main/ipc.js` (`applyRemoteSetting`) both on settings save and at app launch. Default port is `remotePort` (default 7000).

**Data flow:**
```
Phone POST /api/command
  → RemoteServer._onCommand
    → main/ipc.js relays to renderer via 'remote:command'
      → renderer/app.js handles 'remote:command' → updates playback

Renderer changes playback state
  → renderer/app.js sends 'remote:state' IPC
    → main/ipc.js broadcasts via remoteServer.broadcastState()
      → SSE → all phones receive update
```

### Phone UI & Commands

Located in `renderer/remote/` (index.html, remote.css, remote.js). Mobile-optimized single page with:
- Current track display with album art
- Transport controls (play/pause, next, prev, shuffle toggle)
- Seek slider and time display
- Volume slider
- Tappable full playlist
- Request queue display ("+queue" button)
- DJ BREAK button (triggers on-demand break)

**Supported commands:**
- `toggle`, `play`, `pause` — playback control
- `next`, `prev` — track navigation
- `shuffle` — toggle shuffle mode
- `seek` — seek to position
- `volume` — set master volume
- `play-index` — play track at index
- `djbreak` — trigger on-demand DJ break
- `queue-add` — add track to request queue
- `queue-remove` — remove from request queue

### Request Queue (`renderer/remote-queue.js`)

Simple FIFO queue helper. `nextFromQueue(queue)` shifts and returns the first item. In `app.js`, `playNext()` checks the queue before normal/shuffle advance.

### Desktop Connect Panel

The `📱` button opens an overlay showing the LAN URL and a QR code (generated via the optional `qrcode` dependency; if unavailable, the URL displays as plain text). Clicking the overlay or the X button closes it.

---

## Timers (V2 Phase 3)

### Pomodoro Timer (`renderer/pomodoro.js`)

Pure state machine via `nextPomodoroPhase(current, completedFocus, longEvery)`: transitions focus → short/long break (based on `longEvery` interval) and break → focus. The `PomodoroTimer` class manages configuration, lifecycle, and state callbacks.

**Core API:**

| Method | Description |
|---|---|
| `configure({ focus, short, long, longEvery })` | Set phase durations (minutes) and long-break interval |
| `start()` | Begin countdown; fires `onPhaseChange` on entry, `onTick` every second |
| `pause()` | Suspend countdown; state persists |
| `reset()` | Return to idle; clear completed focus count |
| `skip()` | Advance to next phase immediately |
| `getState()` | Return `{phase, kind, remaining, running, completedFocus}` |

**Callbacks:** `onPhaseChange({phase, kind})` fires when entering a new phase; `onTick(state)` fires on every 1-second tick. On each phase change, the renderer announces a bilingual phrase (from settings based on `ttsVoice`) via the existing TTS pipeline (using `speech` method in app.js). The music resumes where it left off: the current file re-plays and seeks to the saved offset (because TTS playback overwrites the audio buffer). Empty phrase lists are handled gracefully (no announcement).

### Sleep Timer

`setSleep(minutes)` sets an end timestamp. The unified 1-second `onSecond` tick (in app.js) checks expiry and triggers `sleepFadeOutAndPause`: a 5-second volume fade from current level to 0, then pause. The saved volume is restored without persisting, so the next play resumes at normal level.

### Desktop Timers UI

The `⏱` button opens a timers overlay with controls:
- **Sleep:** Off, 15, 30, 60, 90 minutes (live `#sleep-display` shows remaining time)
- **Pomodoro:** Start, Pause, Skip, Reset buttons (live `#pomo-display` shows phase/remaining)

### Phone Remote Timers

A dedicated Timers section in the phone UI mirrors all desktop controls. Timer state rides the Phase-2 SSE channel: `sleep: {active, remaining}` and full `pomodoro.getState()` are included in both full state broadcasts and the ~1/sec tick updates. 

**Remote commands added:** `sleep-set` (0=off), `pomo-start`, `pomo-pause`, `pomo-skip`, `pomo-reset`.

---

## Settings System

### `main/settings.js` — SettingsStore

Persists settings to `<userData>/settings.json`. `userData` is the Electron app data directory (typically `C:\Users\<user>\AppData\Roaming\saikou-radio`).

**Save strategy:** Writes to a `.tmp` file first, then renames to the real path. This ensures the settings file is never partially written.

**All settings and their defaults:**

| Key | Default | Description |
|---|---|---|
| `breakInterval` | `15` | Minutes between DJ breaks |
| `ttsEngine` | `'edge'` | `'edge'` or `'sapi'` |
| `ttsVoice` | `'en-US-AriaNeural'` | Voice name |
| `jinglesEnabled` | `false` | Whether to play a jingle before TTS |
| `jinglesFolder` | `''` | Absolute path to folder of jingle audio files |
| `theme` | `'y2k-silver'` | Active theme ID |
| `customThemePath` | `''` | Absolute path to custom CSS file |
| `loop` | `true` | Loop playlist at end |
| `shuffle` | `false` | Shuffle playback order |
| `alwaysOnTop` | `false` | Window always on top |
| `fadeSeconds` | `2` | Fade in/out duration in seconds |
| `personalityPhrases` | (25 EN phrases) | English DJ personality phrases |
| `personalityPhrasesES` | (20 ES phrases) | Spanish DJ personality phrases |
| `volume` | `1` | Master volume (0–1) |
| `visualizerStyle` | `'bars'` | Active visualizer style (`bars`, `scope`, `radial`, `particles`) |
| `visualizerAutoRotate` | `false` | Auto-cycle visualizer style every N tracks |
| `visualizerRotateEvery` | `3` | Number of tracks between auto-rotations |
| `ambientArtBackground` | `true` | Show blurred album art behind the visualizer in fullscreen |
| `djSubtitles` | `true` | Show DJ spoken line as subtitle overlay during a break |
| `remoteEnabled` | `false` | Start LAN remote server |
| `remotePort` | `7000` | LAN server port |
| `pomodoroWork` | `25` | Focus phase duration (minutes) |
| `pomodoroShortBreak` | `5` | Short break duration (minutes) |
| `pomodoroLongBreak` | `15` | Long break duration (minutes) |
| `pomodoroLongEvery` | `4` | Long break interval (every N focus blocks) |
| `pomodoroFocusPhrases` | (5 EN phrases) | English focus-start announcements |
| `pomodoroFocusPhrasesES` | (5 ES phrases) | Spanish focus-start announcements |
| `pomodoroBreakPhrases` | (5 EN phrases) | English break-start announcements |
| `pomodoroBreakPhrasesES` | (5 ES phrases) | Spanish break-start announcements |

### Settings Window

A separate `BrowserWindow` (480×560, non-resizable, child of main window). Inherits the active theme via `<link id="theme-link">` and applies theme changes live as you switch the dropdown. On save:

1. Calls `window.saikouAPI.saveSettings(newSettings)` (IPC: `settings:save`)
2. Sends `settings:notify-reload` (non-invoke `ipcRenderer.send`)
3. Closes the window

The main window receives `settings:reload` and re-runs `loadSettings()`, which updates the theme, fade duration, DJ engine display, and shuffle button state.

---

## Mini Player

Activated by clicking the `_` button in the DJ panel. Deactivated by clicking the expand button on the right edge of the mini bar.

**What changes at the OS level (`window:mini`):**
```js
win.setResizable(true)
win.setContentSize(480, 100)    // content area, not window including frame
win.setPosition(right, bottom)  // bottom-right corner of work area
win.setAlwaysOnTop(true)
win.setResizable(false)
win.on('moved', snapMiniToCorner)
```

**What changes at the DOM level:**
```css
body.mini #main     { display: none; }
body.mini #titlebar { display: none; }
body.mini #mini-bar { display: flex; }
```

**Corner snapping:** The `moved` event fires after every drag. `snapMiniToCorner()` reads `win.getPosition()` and `win.getSize()`, computes the window center X, and compares it to screen center X. If left of center → snaps to bottom-left; if right of center → snaps to bottom-right.

**Mini bar layout (left to right):**
- 76×76 album art square (shows `♪` placeholder when no art; `<img class="visible">` when art is available)
- Info column: scrolling marquee + controls row (`|<` `>` `>|`)
- Narrow expand button (20px wide, full height)

**Marquee animation:**
```css
@keyframes marquee-scroll {
  0%   { transform: translateX(480px); }
  100% { transform: translateX(-100%); }
}
```
Short titles (< 36 chars) get class `short` which disables the animation and left-pads the text instead.

On restore (`window:restore`):
- Removes the `moved` listener
- Restores `setContentSize(760, 440)`
- Re-centers the window in the work area
- Restores `alwaysOnTop` to the saved setting value

---

## Playback Engine

### Track lifecycle

```
User clicks track (or playNext fires)
  → playTrackAt(index)
    → failedTracks check (skip if already errored)
    → playlist.jumpTo(index)
    → updateNowPlaying() → renderPlaylist(), syncMiniTrack()
    → showAlbumArt(track)
    → audio.playFile(track.path)
      → IPC: fs:readFile → returns Uint8Array
      → AudioContext.decodeAudioData()
      → BufferSource.start()
    ↓ (on error)
    → mark track.error = true, add to failedTracks
    → renderPlaylist() (shows red in sidebar)
    → playNext() (skips)
    ↓ (on track end)
    → audio.onTrackEnd fires
    → if breakPending → runDJBreak() then playNext()
    → else → playNext()
```

### `failedTracks` Set

Replaces the old `playAttempts` counter (which was broken — it reset to 0 on every successful play, making the guard ineffective). `failedTracks` is a `Set<number>` of track indices that have thrown errors. `playTrackAt` returns immediately if the index is in the set. The set is cleared when a new playlist is opened.

### Seek slider

The seek slider (`<input type="range" min="0" max="1000">`) represents position as a fraction `0–1000`. The fill is driven by a CSS custom property:

```css
background: linear-gradient(
  to right,
  var(--text-accent) 0%,
  var(--text-accent) var(--seek-pct, 0%),
  #003344 var(--seek-pct, 0%),
  #003344 100%
);
```

`--seek-pct` is updated by `audio.onTimeUpdate` and also on the `input` event during drag. During drag (`seekDragging = true`), the position update from `onTimeUpdate` is suppressed. On `mouseup`/`touchend`, `audio.seekTo(frac * audio._duration)` is called.

---

## Playlist System

### M3U parsing

`PlaylistManager.loadFromText(text, playlistPath)` handles:

- `#EXTM3U` header (skipped)
- `#EXTINF:<duration>,<Artist> - <Title>` — parsed for pre-population of artist/title. The ` - ` separator (space-dash-space) is used to split artist and title
- Other `#` lines — ignored
- Path lines — resolved relative to the playlist file's directory if not absolute

Absolute path detection:
```js
const isAbsolute = /^([A-Za-z]:[/\\]|\/)/.test(line)
```

### Metadata loading

After parsing, metadata is loaded in batches of 8 via `music-metadata`:

```js
const BATCH = 8
for (let i = 0; i < total; i += BATCH) {
  await Promise.all(playlist.tracks.slice(i, i + BATCH).map(async (track) => {
    const meta = await window.saikouAPI.readMetadata(track.path)
    if (meta.title)  track.title  = meta.title
    if (meta.artist) track.artist = meta.artist
    track._picture = meta.picture   // base64 data URL or null
  }))
  renderPlaylist()  // updates sidebar after each batch
}
```

During loading:
- Open button is disabled
- LCD shows "Loading playlist..."
- DJ status bar shows `X / Y` progress counter
- Playlist sidebar updates progressively after each batch of 8

Album art (`_picture`) is stored as a `data:image/<format>;base64,...` string, applied directly to `<img>` elements via `src`. This avoids any file system reads at display time.

---

## Shuffle System

When shuffle is enabled, a persistent ordered queue is generated using Fisher-Yates:

```js
function buildShuffleQueue(currentIndex) {
  const indices = playlist.tracks.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  // Bring currentIndex to the front for seamless continuity
  const pos = indices.indexOf(currentIndex)
  if (pos > 0) indices.unshift(...indices.splice(pos, 1))
  shuffleQueue = indices
  shufflePos = 0
}
```

`playNext()` in shuffle mode advances `shufflePos`. When it reaches the end of `shuffleQueue`, a new order is generated (starting from the first track of the previous queue). This means every song plays exactly once per cycle.

The playlist sidebar reflects the shuffle order when active:
```js
const order = (settings.shuffle && shuffleQueue.length === playlist.tracks.length)
  ? shuffleQueue
  : playlist.tracks.map((_, i) => i)
```

---

## Build & Packaging

### `electron-builder.yml`

```yaml
appId: com.saikouradio.app
productName: Saikou Radio
directories:
  output: dist
files:
  - main/**
  - renderer/**
  - themes/**
  - assets/**
win:
  target: nsis
  icon: assets/icon.png
```

Only source directories are bundled (`main/`, `renderer/`, `themes/`, `assets/`). `node_modules` are bundled by electron-builder's ASAR packer automatically.

### Build command

npm is not in the Git Bash PATH; must be invoked with its full path:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
"/c/Program Files/nodejs/npm.cmd" run build
```

Output:
- `dist/win-unpacked/` — unpacked app directory
- `dist/Saikou Radio Setup <version>.exe` — NSIS one-click installer (per-user install, no elevation required)
- `dist/Saikou Radio Setup <version>.exe.blockmap` — for delta updates

The `rcedit` step (stamping version metadata into the exe) fails if the app is currently running (file lock). This is non-fatal — the installer is still built correctly.

### Version history

| Version | Changes |
|---|---|
| 1.0.0 | Initial release |
| 1.1.0 | Mini player, themes, seek slider, shuffle queue, codebase cleanup |
| 1.1.1 | Batched metadata loading with live progress counter |
| 1.1.2 | DJ announces correct next track in shuffle mode |
| 2.0.0-phase1 | V2 Phase 1: fullscreen mode, VisualizerEngine (bars/scope/radial/particles), master volume, ambient art background, DJ subtitles, keyboard shortcuts |
| 2.0.0-phase2 | V2 Phase 2: LAN remote control from phone, request queue, QR connect panel |
| 2.0.0 | V2 complete: sleep timer and Pomodoro timer with bilingual TTS announcements, desktop and phone UI controls |

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `msedge-tts` | ^2.0.5 | Microsoft Edge neural TTS API |
| `music-metadata` | ^7.14.0 | Audio file metadata parsing (ID3, Vorbis, etc.) |
| `98.css` | ^0.1.21 | Windows 98 UI stylesheet (used only for win98 theme) |
| `qrcode` | ^1.5.4 | QR code generation for the remote connect panel |

### Dev

| Package | Version | Purpose |
|---|---|---|
| `electron` | ^31.7.7 | Desktop app runtime |
| `electron-builder` | ^24.0.0 | Packaging and NSIS installer generation |
| `jest` | ^29.0.0 | Unit testing |

---

## Known Quirks

**`rcedit` warning on build:** `rcedit-x64.exe` cannot stamp version info into the Electron exe while the app is running (Windows file lock). The build recovers and produces a valid installer anyway.

**IPC Buffer coercion:** Electron's IPC serializes Node `Buffer` objects as plain objects with numeric keys when sent from main to renderer. `preload.js` detects this and coerces back to `Uint8Array` via `Object.values()`.

**`setContentSize` vs `setSize`:** The mini player uses `win.setContentSize(480, 100)` rather than `win.setSize()`. Because `frame: false` is set, both should be equivalent — but `setContentSize` is semantically correct and avoids any future ambiguity if the frame setting changes.

**`contextIsolation: false`:** The app runs with context isolation disabled, meaning `require()` is available directly in the renderer. This simplifies the architecture at the cost of the isolation security boundary. Since this is a local desktop app with no remote content loaded, the risk is accepted.

**Edge TTS requires internet:** The Edge TTS voice list and synthesis both require an active internet connection. If unavailable, synthesis fails and falls back to SAPI. SAPI runs fully offline using Windows installed voices.

**Settings window theme:** The settings window loads its own `<link id="theme-link">` and applies theme changes live as you switch the dropdown. It does not inherit the main window's current state — it reads the saved theme from settings on open.
