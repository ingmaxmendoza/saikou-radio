// tests/settings.test.js
const path = require('path')
const os = require('os')
const fs = require('fs')
const { SettingsStore, DEFAULTS } = require('../main/settings')

let store
let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saikou-test-'))
  store = new SettingsStore(tmpDir)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true })
})

test('returns defaults when no file exists', () => {
  const s = store.get()
  expect(s.breakInterval).toBe(15)
  expect(s.ttsEngine).toBe('edge')
  expect(s.jinglesEnabled).toBe(false)
  expect(s.theme).toBe('y2k-silver')
  expect(s.loop).toBe(true)
  expect(s.shuffle).toBe(false)
  expect(s.alwaysOnTop).toBe(false)
  expect(s.personalityPhrases).toBeInstanceOf(Array)
  expect(s.personalityPhrases.length).toBeGreaterThan(0)
})

test('saves and reloads settings', () => {
  store.save({ theme: 'dark-lcd', breakInterval: 20 })
  const store2 = new SettingsStore(tmpDir)
  const s = store2.get()
  expect(s.theme).toBe('dark-lcd')
  expect(s.breakInterval).toBe(20)
  expect(s.ttsEngine).toBe('edge') // defaults preserved
})

test('save merges with defaults', () => {
  store.save({ shuffle: true })
  const s = store.get()
  expect(s.shuffle).toBe(true)
  expect(s.loop).toBe(true) // unchanged default
})

test('falls back to defaults on corrupt settings file', () => {
  fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{broken json')
  const s = new SettingsStore(tmpDir)
  expect(s.get().breakInterval).toBe(15)
})

test('Phase 1 visualizer/volume defaults exist', () => {
  expect(DEFAULTS.volume).toBe(1)
  expect(DEFAULTS.visualizerStyle).toBe('bars')
  expect(DEFAULTS.visualizerAutoRotate).toBe(false)
  expect(DEFAULTS.visualizerRotateEvery).toBe(3)
  expect(DEFAULTS.ambientArtBackground).toBe(true)
  expect(DEFAULTS.djSubtitles).toBe(true)
})

test('existing V1 defaults are untouched', () => {
  expect(DEFAULTS.fadeSeconds).toBe(2)
  expect(DEFAULTS.theme).toBe('y2k-silver')
})

test('Phase 2 remote defaults exist', () => {
  expect(DEFAULTS.remoteEnabled).toBe(false)
  expect(DEFAULTS.remotePort).toBe(7000)
})

test('Phase 3 pomodoro defaults exist', () => {
  expect(DEFAULTS.pomodoroWork).toBe(25)
  expect(DEFAULTS.pomodoroShortBreak).toBe(5)
  expect(DEFAULTS.pomodoroLongBreak).toBe(15)
  expect(DEFAULTS.pomodoroLongEvery).toBe(4)
  expect(Array.isArray(DEFAULTS.pomodoroFocusPhrases)).toBe(true)
  expect(DEFAULTS.pomodoroFocusPhrases.length).toBeGreaterThan(0)
  expect(Array.isArray(DEFAULTS.pomodoroFocusPhrasesES)).toBe(true)
  expect(Array.isArray(DEFAULTS.pomodoroBreakPhrases)).toBe(true)
  expect(Array.isArray(DEFAULTS.pomodoroBreakPhrasesES)).toBe(true)
})
