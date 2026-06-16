// tests/visualizer.test.js
const { STYLE_NAMES, nextStyleName, resolveThemeColor } = require('../renderer/visualizer')

test('STYLE_NAMES has the four styles in order', () => {
  expect(STYLE_NAMES).toEqual(['bars', 'scope', 'radial', 'particles'])
})

test('nextStyleName cycles and wraps', () => {
  expect(nextStyleName('bars')).toBe('scope')
  expect(nextStyleName('particles')).toBe('bars')
})

test('nextStyleName falls back to first for unknown', () => {
  expect(nextStyleName('nope')).toBe('bars')
})

test('resolveThemeColor returns trimmed value or fallback', () => {
  const getProp = (n) => (n === '--text-accent' ? '  #33ff33 ' : '')
  expect(resolveThemeColor('--text-accent', '#000', getProp)).toBe('#33ff33')
  expect(resolveThemeColor('--missing', '#abc', getProp)).toBe('#abc')
})
