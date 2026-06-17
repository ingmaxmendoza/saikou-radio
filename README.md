# Saikou Radio

A Y2K-aesthetic desktop radio player for your local music library. Load `.m3u` playlists and let Saikou Radio run like a real station — complete with a DJ that announces tracks, drops personality quips, and reads the time every 15 minutes.

Built with Electron.

---

## Features

- **DJ breaks** — every 15 minutes the music pauses and a voice DJ announces what you just heard, what's coming up, and the current time
- **Text-to-speech** — uses Microsoft Edge TTS (natural-sounding voices) with a SAPI fallback
- **Multi-playlist support** — point Saikou at a folder full of `.m3u` files and load them all at once
- **No-repeat smart shuffle** — tracks won't repeat until the whole deck has played
- **Y2K aesthetic** — six built-in themes (Y2K Silver, Dark LCD, Blueberry XP, Win98, Green Terminal, White on Black) plus custom CSS support
- **Phone remote** — control playback from any phone on the same Wi-Fi, themed to match the desktop
- **Timers** — Pomodoro timer and sleep timer with bilingual TTS announcements
- **Customizable** — edit the DJ's personality phrases, pick your TTS voice, set the break interval

---

## Download

Grab the latest installer from [Releases](https://github.com/ingmaxmendoza/saikou-radio/releases).

| Version | Notes |
|---------|-------|
| **v2.2.1** | Saikou icon (`.ico`), ASCII UI (no emoji), themed phone remote, remote sync fix |
| v2.1.0 | Multi-playlist library folder, queue-aware DJ, source naming |
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

## Creating .m3u Playlists (for testers)

An `.m3u` file is a plain text file that lists audio file paths, one per line. You can create one in any text editor — just save it with the `.m3u` extension.

**Basic format:**

```
#EXTM3U

#EXTINF:213,Artist Name - Track Title
C:\Music\artist_name - track_title.mp3

#EXTINF:180,Another Artist - Another Track
C:\Music\another_artist - another_track.mp3
```

- `#EXTM3U` — header line, required once at the top
- `#EXTINF:<duration in seconds>,<Artist> - <Title>` — metadata for the next track (the DJ reads this)
- The line after `#EXTINF` is the file path to the audio file

**Minimal format (no metadata):**

If you just want something quick, `#EXTINF` lines are optional. A bare list of paths works too:

```
C:\Music\song1.mp3
C:\Music\song2.mp3
C:\Music\song3.mp3
```

The DJ will still speak the filename as the track name, just without artist info.

**Tips for testers:**

- Paths can be absolute (`C:\Music\song.mp3`) or relative to the `.m3u` file's location (`songs\song.mp3`)
- Supported formats: `.mp3`, `.flac`, `.wav`, `.ogg`, `.aac`, `.m4a`
- Put multiple `.m3u` files in one folder and point **Settings → Playlists Library** at that folder to load them all at once
- The DJ reads artist and title from the `#EXTINF` line — fill these in for the best experience

**Quick way to generate one on Windows:**

Open PowerShell in your music folder and run:

```powershell
"#EXTM3U" | Out-File -Encoding utf8 my_playlist.m3u
Get-ChildItem -Filter *.mp3 | ForEach-Object { "#EXTINF:-1,$($_.BaseName)`n$($_.FullName)" } | Out-File -Encoding utf8 -Append my_playlist.m3u
```

This creates `my_playlist.m3u` with every `.mp3` in the folder.

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
