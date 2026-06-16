// tests/pomodoro.test.js
const { nextPomodoroPhase } = require('../renderer/pomodoro')

test('focus -> short break, increments completedFocus', () => {
  expect(nextPomodoroPhase('focus', 0, 4)).toEqual({ phase: 'break', kind: 'short', completedFocus: 1 })
})

test('every Nth focus -> long break', () => {
  expect(nextPomodoroPhase('focus', 3, 4)).toEqual({ phase: 'break', kind: 'long', completedFocus: 4 })
  expect(nextPomodoroPhase('focus', 7, 4)).toEqual({ phase: 'break', kind: 'long', completedFocus: 8 })
})

test('break -> focus, keeps completedFocus', () => {
  expect(nextPomodoroPhase('break', 4, 4)).toEqual({ phase: 'focus', kind: 'focus', completedFocus: 4 })
})

test('idle -> focus', () => {
  expect(nextPomodoroPhase('idle', 0, 4)).toEqual({ phase: 'focus', kind: 'focus', completedFocus: 0 })
})
