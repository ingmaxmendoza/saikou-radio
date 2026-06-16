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
10. [Settings System](#settings-system)
11. [Mini Player](#mini-player)
12. [Playback Engine](#playback-engine)
13. [Playlist System](#playlist-system)
14. [Shuffle System](#shuffle-system)
15. [Metadata Loading](#metadata-loading)
16. [Build & Packaging](#build--packaging)
17. [Dependencies](#dependencies)
18. [Known Quirks](#known-quirks)

---

## Overview

| Property | Value |
|---|---|
| App name | Saikou Radio |
| Version | 1.1.1 |
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

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `msedge-tts` | ^2.0.5 | Microsoft Edge neural TTS API |
| `music-metadata` | ^7.14.0 | Audio file metadata parsing (ID3, Vorbis, etc.) |
| `98.css` | ^0.1.21 | Windows 98 UI stylesheet (used only for win98 theme) |

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
