// tests/remote-state.test.js
const { nextFromQueue } = require('../renderer/remote-queue')

test('nextFromQueue returns and removes the head', () => {
  const q = [3, 1, 2]
  expect(nextFromQueue(q)).toBe(3)
  expect(q).toEqual([1, 2])
})

test('nextFromQueue returns null on empty queue', () => {
  const q = []
  expect(nextFromQueue(q)).toBeNull()
})
