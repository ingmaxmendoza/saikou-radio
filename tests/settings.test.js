// tests/settings.test.js
const path = require('path')
const os = require('os')
const fs = require('fs')
const { SettingsStore } = require('../main/settings')

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
