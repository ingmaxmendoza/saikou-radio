# Saikou Radio

A Y2K-aesthetic desktop radio player for your local music library. Load `.m3u` playlists and let Saikou Radio run like a real station — complete with a DJ that announces tracks, drops personality quips, and reads the time every 15 minutes.

Built with Electron.

---

## Features

- **DJ breaks** — every 15 minutes the music pauses and a voice DJ announces what you just heard, what's coming up, and the current time
- **Text-to-speech** — uses Microsoft Edge TTS (natural-sounding voices) with a SAPI fallback
- **Multi-playlist support** — point Saikou at a folder full of `.m3u` files and load them all at once
- **No-repeat smart shuffle** — tracks won't repeat until the whole deck has played
- **Y2K aesthetic** — silver brushed-metal UI inspired by Windows XP and early iTunes
- **Customizable** — edit the DJ's personality phrases, pick your TTS voice, set the break interval

---

## Download

Grab the latest installer from [Releases](https://github.com/ingmaxmendoza/saikou-radio/releases).

| Version | Notes |
|---------|-------|
| **v2.1.0** | Multi-playlist library folder, queue-aware DJ, source naming |
| v1.1.1 | Patch |
| v1.1.0 | — |
| v1.0.0 | Initial release |

Windows only for now.

---

## Getting Started

1. Download and run the installer
2. Open Saikou Radio
3. Go to **Settings → Playlists Library** and point it at a folder containing your `.m3u` files (or load a single playlist from the main window)
4. Hit play — the DJ takes it from there

---

## Running from Source

```bash
git clone https://github.com/ingmaxmendoza/saikou-radio.git
cd saikou-radio
npm install
npm start
```

To build an installer:

```bash
npm run build
```

Requires Node.js 18+ and a Windows environment for the Edge TTS integration.

---

## How the DJ Works

At the 15-minute mark the player sets a `breakPending` flag. When the current track ends, the DJ sequence fires:

1. (Optional) plays a jingle from your configured jingles folder
2. Builds a script: *"You just heard [track] by [artist]. Coming up next, [track]. It's [time]. [personality phrase]. You're listening to Saikou Radio."*
3. Sends the script to Edge TTS, receives audio, plays it
4. Resumes the playlist

You can edit the personality phrases and pick any available TTS voice from Settings.

---

## Stack

- [Electron](https://www.electronjs.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [msedge-tts](https://www.npmjs.com/package/msedge-tts)
- [music-metadata](https://www.npmjs.com/package/music-metadata)
- [98.css](https://jdan.github.io/98.css/) — for that authentic Y2K look
