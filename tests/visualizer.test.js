// tests/visualizer.test.js
const { STYLE_NAMES, nextStyleName, resolveThemeColor, VisualizerEngine } = require('../renderer/visualizer')

test('STYLE_NAMES has all nine styles in order', () => {
  expect(STYLE_NAMES).toEqual([
    'bars', 'scope', 'radial', 'particles',
    'waterfall', 'vu', 'starfield', 'plasma', 'aurora',
  ])
})

test('nextStyleName cycles and wraps across all nine', () => {
  expect(nextStyleName('bars')).toBe('scope')
  expect(nextStyleName('particles')).toBe('waterfall')
  expect(nextStyleName('waterfall')).toBe('vu')
  expect(nextStyleName('vu')).toBe('starfield')
  expect(nextStyleName('starfield')).toBe('plasma')
  expect(nextStyleName('plasma')).toBe('aurora')
  expect(nextStyleName('aurora')).toBe('bars')
})

test('nextStyleName falls back to first for unknown', () => {
  expect(nextStyleName('nope')).toBe('bars')
})

test('resolveThemeColor returns trimmed value or fallback', () => {
  const getProp = (n) => (n === '--text-accent' ? '  #33ff33 ' : '')
  expect(resolveThemeColor('--text-accent', '#000', getProp)).toBe('#33ff33')
  expect(resolveThemeColor('--missing', '#abc', getProp)).toBe('#abc')
})

test('VisualizerEngine has all five new draw methods', () => {
  expect(typeof VisualizerEngine.prototype._drawWaterfall).toBe('function')
  expect(typeof VisualizerEngine.prototype._drawVU).toBe('function')
  expect(typeof VisualizerEngine.prototype._drawStarfield).toBe('function')
  expect(typeof VisualizerEngine.prototype._drawPlasma).toBe('function')
  expect(typeof VisualizerEngine.prototype._drawAurora).toBe('function')
})
