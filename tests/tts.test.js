// tests/tts.test.js
const { buildSAPIScript } = require('../main/tts')

test('buildSAPIScript returns a powershell script string', () => {
  const script = buildSAPIScript('Hello world', 'en-US', 'C:\\tmp\\out.wav')
  expect(script).toContain('SpeechSynthesizer')
  expect(script).toContain('Hello world')
  expect(script).toContain('C:\\tmp\\out.wav')
})

test('buildSAPIScript escapes single quotes in text and voice', () => {
  const script = buildSAPIScript("O'Brien said hello", "Microsoft O'Hara Voice", 'C:\\tmp\\out.wav')
  expect(script).toContain("O''Brien said hello")
  expect(script).toContain("Microsoft O''Hara Voice")
})
