// tests/remote-server.test.js
const { getLanIp, parseCommand } = require('../main/remote-server')

test('getLanIp returns first non-internal IPv4', () => {
  const ifaces = {
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    eth0: [{ family: 'IPv6', internal: false, address: '::1' },
           { family: 'IPv4', internal: false, address: '192.168.1.42' }],
  }
  expect(getLanIp(ifaces)).toBe('192.168.1.42')
})

test('getLanIp falls back to loopback when none found', () => {
  expect(getLanIp({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] })).toBe('127.0.0.1')
})

test('parseCommand parses valid JSON with action', () => {
  expect(parseCommand('{"action":"next"}')).toEqual({ action: 'next' })
  expect(parseCommand('{"action":"seek","value":0.5}')).toEqual({ action: 'seek', value: 0.5 })
})

test('parseCommand rejects invalid input', () => {
  expect(parseCommand('not json')).toBeNull()
  expect(parseCommand('{"noaction":true}')).toBeNull()
  expect(parseCommand('123')).toBeNull()
})
