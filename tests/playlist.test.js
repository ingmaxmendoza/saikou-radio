// tests/playlist.test.js
const { PlaylistManager } = require('../renderer/playlist')

test('parses basic m3u file', () => {
  const content = [
    '#EXTM3U',
    '#EXTINF:243,Artist - Song Title',
    'C:/music/song.mp3',
    '#EXTINF:180,Another Artist - Another Song',
    '/music/other.mp3',
  ].join('\n')

  const pm = new PlaylistManager()
  pm.addFromText(content, 'C:/playlists/my.m3u')
  expect(pm.tracks).toHaveLength(2)
  expect(pm.tracks[0].path).toBe('C:/music/song.mp3')
  expect(pm.tracks[0].title).toBe('Song Title')
  expect(pm.tracks[0].artist).toBe('Artist')
  expect(pm.tracks[0].duration).toBe(243)
  expect(pm.tracks[1].path).toBe('/music/other.mp3')
})

test('resolves relative paths against playlist dir', () => {
  const content = [
    '#EXTM3U',
    '#EXTINF:100,Artist - Track',
    'tracks/song.mp3',
  ].join('\n')

  const pm = new PlaylistManager()
  pm.addFromText(content, 'C:/playlists/my.m3u')
  expect(pm.tracks[0].path).toBe('C:/playlists/tracks/song.mp3')
})

test('skips comment lines and empty lines', () => {
  const content = ['#EXTM3U', '', '# a comment', '#EXTINF:60,A - B', 'C:/a.mp3'].join('\n')
  const pm = new PlaylistManager()
  pm.addFromText(content, 'C:/x.m3u')
  expect(pm.tracks).toHaveLength(1)
})

test('handles missing EXTINF gracefully', () => {
  const content = ['#EXTM3U', 'C:/music/raw.mp3'].join('\n')
  const pm = new PlaylistManager()
  pm.addFromText(content, 'C:/x.m3u')
  expect(pm.tracks[0].title).toBe('raw.mp3')
  expect(pm.tracks[0].artist).toBe('')
  expect(pm.tracks[0].duration).toBe(0)
})

test('currentTrack and advance', () => {
  const content = ['#EXTM3U', 'C:/a.mp3', 'C:/b.mp3', 'C:/c.mp3'].join('\n')
  const pm = new PlaylistManager()
  pm.addFromText(content, 'C:/x.m3u')
  expect(pm.currentTrack().path).toBe('C:/a.mp3')
  pm.advance()
  expect(pm.currentTrack().path).toBe('C:/b.mp3')
  pm.advance()
  pm.advance() // wraps when loop=true
  expect(pm.currentTrack().path).toBe('C:/a.mp3')
})

test('addFromText appends and tags source (basename without extension)', () => {
  const pm = new PlaylistManager()
  pm.addFromText('#EXTM3U\nC:/music/a.mp3\n', 'C:/lists/chill.m3u')
  pm.addFromText('C:/music/b.mp3\n', 'C:/lists/hype.m3u8')
  expect(pm.tracks.length).toBe(2)
  expect(pm.tracks[0].source).toBe('chill')
  expect(pm.tracks[1].source).toBe('hype')
})

test('clear empties tracks and resets index', () => {
  const pm = new PlaylistManager()
  pm.addFromText('C:/m/a.mp3\n', 'C:/l/x.m3u')
  pm.jumpTo(0)
  pm.clear()
  expect(pm.tracks.length).toBe(0)
  expect(pm.currentIndex).toBe(0)
})
