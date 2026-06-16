// tests/audio.test.js
const { clampVolume } = require('../renderer/audio')

test('clampVolume clamps to 0..1', () => {
  expect(clampVolume(0.5)).toBe(0.5)
  expect(clampVolume(-1)).toBe(0)
  expect(clampVolume(2)).toBe(1)
})

test('clampVolume falls back to 1 for bad input', () => {
  expect(clampVolume(undefined)).toBe(1)
  expect(clampVolume(NaN)).toBe(1)
  expect(clampVolume('x')).toBe(1)
})
