// tests/dj.test.js
const { buildDJScript } = require('../renderer/dj')

test('includes current track info', () => {
  const script = buildDJScript(
    { title: 'Blue Monday', artist: 'New Order' },
    { title: 'Take On Me', artist: 'A-ha' },
    '3:45 PM',
    'Stay locked in, this is Saikou Radio.'
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
    'Vibes all day.'
  )
  expect(script).not.toContain('undefined')
  expect(script).not.toContain('null')
})

test('handles missing artist gracefully', () => {
  const script = buildDJScript(
    { title: 'Unknown Track', artist: '' },
    null,
    '2:00 PM',
    'Keep it going.'
  )
  expect(script).toContain('Unknown Track')
  expect(script).not.toContain('by ')
})
