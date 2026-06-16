// tests/dj.test.js
const { buildDJScript } = require('../renderer/dj')

test('includes current track info', () => {
  const script = buildDJScript(
    { title: 'Blue Monday', artist: 'New Order' },
    { title: 'Take On Me', artist: 'A-ha' },
    '3:45 PM',
    'Stay locked in, this is Saikou Radio.',
    'en-US-AriaNeural'
  )
  expect(script).toContain('Blue Monday')
  expect(script).toContain('New Order')
  expect(script).toContain('Take On Me')
  expect(script).toContain('A-ha')
  expect(script).toContain('3:45 PM')
  expect(script).toContain('Stay locked in')
})

test('handles missing next track gracefully', () => {
  const script = buildDJScript(
    { title: 'Song', artist: 'Artist' },
    null,
    '1:00 PM',
    'Vibes all day.',
    'en-US-GuyNeural'
  )
  expect(script).not.toContain('undefined')
  expect(script).not.toContain('null')
})

test('handles missing artist gracefully', () => {
  const script = buildDJScript(
    { title: 'Unknown Track', artist: '' },
    null,
    '2:00 PM',
    'Keep it going.',
    'en-US-AriaNeural'
  )
  expect(script).toContain('Unknown Track')
  expect(script).not.toContain('by ')
})

const { DJEngine } = require('../renderer/dj')

test('onScript fires once with the built script before TTS', async () => {
  const scripts = []
  let ttsCalled = false
  const dj = new DJEngine({
    playAudioBuffer: async () => {},
    playJingle: async () => {},
    synthesizeTTS: async () => { ttsCalled = true; return new Uint8Array() },
    getSettings: () => ({ ttsEngine: 'edge', ttsVoice: 'en-US-AriaNeural', personalityPhrases: ['Vibes.'] }),
    getPlaylist: () => ({
      currentTrack: () => ({ title: 'Blue Monday', artist: 'New Order' }),
      currentIndex: 0,
      tracks: [{ title: 'Blue Monday', artist: 'New Order' }],
    }),
    getNextTrack: () => null,
    onScript: (s) => scripts.push(s),
  })
  await dj.runBreak()
  expect(scripts.length).toBe(1)
  expect(scripts[0]).toContain('Blue Monday')
  expect(ttsCalled).toBe(true)
})

const { shouldMentionPlaylist } = require('../renderer/dj')

test('buildDJScript adds EN source sentence when mentionPlaylist', () => {
  const s = buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural', { source: 'chill', mentionPlaylist: true })
  expect(s).toContain('From the chill playlist.')
})

test('buildDJScript adds ES source sentence when mentionPlaylist', () => {
  const s = buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'es-MX-DaliaNeural', { source: 'fiesta', mentionPlaylist: true })
  expect(s).toContain('De la lista fiesta.')
})

test('buildDJScript omits source when not mentioning or no source', () => {
  expect(buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural', { source: 'chill', mentionPlaylist: false })).not.toContain('chill')
  expect(buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural', { source: '', mentionPlaylist: true })).not.toContain('playlist.')
  expect(buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural')).not.toContain('playlist.')
})

test('shouldMentionPlaylist thresholds: 0.15 for one, 0.60 for many', () => {
  expect(shouldMentionPlaylist(1, () => 0.10)).toBe(true)
  expect(shouldMentionPlaylist(1, () => 0.20)).toBe(false)
  expect(shouldMentionPlaylist(3, () => 0.55)).toBe(true)
  expect(shouldMentionPlaylist(3, () => 0.65)).toBe(false)
})
