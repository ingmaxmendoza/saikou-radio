// renderer/remote-queue.js
// Pure helper for the request queue so it can be unit-tested without the DOM.
function nextFromQueue(queue) {
  if (!queue || queue.length === 0) return null
  return queue.shift()
}
module.exports = { nextFromQueue }
