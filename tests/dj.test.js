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
  // "From the" is unique to the source sentence; the bare word "playlist" also
  // appears in random time lines/personality, so match the sentence specifically.
  expect(buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural', { source: '', mentionPlaylist: true })).not.toContain('From the')
  expect(buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural')).not.toContain('From the')
})

test('buildDJScript strips ";3" from spoken playlist names', () => {
  const s = buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural', { source: 'late night;3', mentionPlaylist: true })
  expect(s).toContain('From the late night playlist.')
  expect(s).not.toContain(';3')
  // ES variant + mid-name occurrence collapses cleanly
  const es = buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'es-MX-DaliaNeural', { source: 'chill;3mix', mentionPlaylist: true })
  expect(es).toContain('De la lista chillmix.')
  // a name that is ONLY ";3" leaves nothing to mention
  const empty = buildDJScript({ title: 'X', artist: 'Y' }, null, '1:00 PM', '', 'en-US-AriaNeural', { source: ';3', mentionPlaylist: true })
  expect(empty).not.toContain('From the')
})

test('shouldMentionPlaylist thresholds: 0.15 for one, 0.60 for many', () => {
  expect(shouldMentionPlaylist(1, () => 0.10)).toBe(true)
  expect(shouldMentionPlaylist(1, () => 0.20)).toBe(false)
  expect(shouldMentionPlaylist(3, () => 0.55)).toBe(true)
  expect(shouldMentionPlaylist(3, () => 0.65)).toBe(false)
})

// ---------------------------------------------------------------------------
// Deck (shuffle-bag) system
// ---------------------------------------------------------------------------
const { Deck, daypartFor, getStructuralDecks, getPersonalityDeck, pickQuip } = require('../renderer/dj-content')

test('Deck deals every item once before any repeat', () => {
  const items = ['a', 'b', 'c', 'd', 'e']
  const deck = new Deck(items)
  const drawn = items.map(() => deck.draw())
  expect(new Set(drawn).size).toBe(items.length) // all unique within a cycle
})

test('Deck reshuffles after exhaustion and avoids back-to-back repeat', () => {
  const items = ['a', 'b', 'c', 'd']
  const deck = new Deck(items)
  // Two full cycles; no item should appear twice in a row across the boundary.
  const seq = []
  for (let i = 0; i < items.length * 6; i++) seq.push(deck.draw())
  for (let i = 1; i < seq.length; i++) {
    expect(seq[i]).not.toBe(seq[i - 1])
  }
})

test('Deck handles empty and single-item decks', () => {
  expect(new Deck([]).draw()).toBe('')
  const one = new Deck(['only'])
  expect(one.draw()).toBe('only')
  expect(one.draw()).toBe('only')
})

test('daypartFor maps hours to the right part of day', () => {
  expect(daypartFor(2)).toBe('lateNight')
  expect(daypartFor(23)).toBe('lateNight')
  expect(daypartFor(8)).toBe('morning')
  expect(daypartFor(14)).toBe('afternoon')
  expect(daypartFor(20)).toBe('evening')
})

// ---------------------------------------------------------------------------
// composeBreak
// ---------------------------------------------------------------------------
const { composeBreak } = require('../renderer/dj')

function rngSequence(values) {
  let i = 0
  return () => values[(i++) % values.length]
}

const track = { title: 'Blue Monday', artist: 'New Order' }

test('composeBreak always includes heard, time, personality and a Saikou sign-off', () => {
  const script = composeBreak({
    currentTrack: track,
    nextTrack: null,
    timeStr: '3:45 PM',
    voice: 'en-US-AriaNeural',
    now: new Date(2026, 0, 1, 14, 0), // afternoon
    rng: () => 0.99, // no bonus, no daypart time line
  })
  expect(script).toContain('Blue Monday')
  expect(script).toContain('3:45 PM')
  expect(script).toContain('Saikou Radio')
})

test('composeBreak adds a bonus line only sometimes', () => {
  // rng < 0.35 gate fails -> no bonus
  const noBonus = composeBreak({
    currentTrack: track, nextTrack: null, timeStr: '1:00 PM',
    voice: 'en-US-AriaNeural', now: new Date(2026, 0, 1, 14, 0),
    rng: () => 0.99,
  })
  // rng sequence: mention(no), bonus-gate(yes), quip-vs-fact(quip), then picks
  const withBonus = composeBreak({
    currentTrack: track, nextTrack: null, timeStr: '1:00 PM',
    voice: 'en-US-AriaNeural', now: new Date(2026, 0, 1, 14, 0),
    rng: rngSequence([0.9, 0.1, 0.1, 0.0]),
  })
  expect(withBonus.length).toBeGreaterThan(noBonus.length)
})

test('composeBreak picks Spanish content for an es- voice', () => {
  const script = composeBreak({
    currentTrack: track, nextTrack: null, timeStr: '13:00',
    voice: 'es-MX-DaliaNeural', now: new Date(2026, 0, 1, 14, 0),
    rng: () => 0.99,
  })
  // Spanish sign-offs all mention Saikou Radio; structural lines are Spanish.
  // The "heard" line is always present — match every one of its 12 variants so
  // this stays deterministic regardless of which (randomly drawn) sign-off/time
  // line accompanies it.
  expect(script).toContain('Saikou Radio')
  expect(script.toLowerCase()).toMatch(/escuchar|eso fue|directo|acabamos|cortesía|todavía|dejando|espero|haciendo|seguimos/)
})

test('getPersonalityDeck layers user phrases on top of built-ins', () => {
  const deck = getPersonalityDeck('en', ['MY CUSTOM LINE'])
  const seen = new Set()
  for (let i = 0; i < deck.size; i++) seen.add(deck.draw())
  expect(seen.has('MY CUSTOM LINE')).toBe(true)
  expect(deck.size).toBeGreaterThan(50)
})

test('pickQuip returns a daypart-appropriate or general quip', () => {
  const q = pickQuip('en', 2, () => 0) // lateNight, first eligible
  expect(typeof q).toBe('string')
  expect(q.length).toBeGreaterThan(0)
})

test('content banks each hold roughly 100 variable lines per language', () => {
  const { BANKS } = require('../renderer/dj-content')
  for (const lang of ['en', 'es']) {
    const b = BANKS[lang]
    const quipCount = Object.values(b.quips).reduce((n, arr) => n + arr.length, 0)
    const variable = b.personality.length + quipCount + b.facts.length
    expect(variable).toBeGreaterThanOrEqual(95)
  }
})
