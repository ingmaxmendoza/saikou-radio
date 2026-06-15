// tests/scheduler.test.js
jest.useFakeTimers()

const { BreakScheduler } = require('../renderer/scheduler')

test('fires callback after interval', () => {
  const cb = jest.fn()
  const s = new BreakScheduler(15, cb)
  s.start()
  jest.advanceTimersByTime(14 * 60 * 1000)
  expect(cb).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1 * 60 * 1000)
  expect(cb).toHaveBeenCalledTimes(1)
  s.stop()
})

test('does not fire after stop', () => {
  const cb = jest.fn()
  const s = new BreakScheduler(15, cb)
  s.start()
  s.stop()
  jest.advanceTimersByTime(20 * 60 * 1000)
  expect(cb).not.toHaveBeenCalled()
})

test('reset restarts the countdown', () => {
  const cb = jest.fn()
  const s = new BreakScheduler(15, cb)
  s.start()
  jest.advanceTimersByTime(10 * 60 * 1000)
  s.reset()
  jest.advanceTimersByTime(10 * 60 * 1000)
  expect(cb).not.toHaveBeenCalled()
  jest.advanceTimersByTime(5 * 60 * 1000)
  expect(cb).toHaveBeenCalledTimes(1)
  s.stop()
})

test('remainingMs returns approximate remaining time', () => {
  const s = new BreakScheduler(15, () => {})
  s.start()
  jest.advanceTimersByTime(5 * 60 * 1000)
  const remaining = s.remainingMs()
  expect(remaining).toBeGreaterThan(9 * 60 * 1000 - 100)
  expect(remaining).toBeLessThanOrEqual(10 * 60 * 1000)
  s.stop()
})
