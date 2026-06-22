// main/tts.js
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')

async function synthesizeEdge(text, voice) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const result = tts.toStream(text)
  // v2 returns { audioStream, metadataStream, requestId }
  const audioStream = result.audioStream ?? result
  return new Promise((resolve, reject) => {
    const chunks = []
    audioStream.on('data', (chunk) => chunks.push(chunk))
    audioStream.on('end', () => resolve(Buffer.concat(chunks)))
    audioStream.on('error', reject)
  })
}

async function synthesize(text, voice) {
  return synthesizeEdge(text, voice)
}

module.exports = { synthesize }
