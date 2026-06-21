// main/tts.js
const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')

function buildSAPIScript(text, voice, outPath) {
  const escaped = text.replace(/'/g, "''")
  const escapedVoice = voice.replace(/'/g, "''")
  const escapedPath = outPath.replace(/'/g, "''")
  return [
    `Add-Type -AssemblyName System.Speech`,
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
    `try { $s.SelectVoice('${escapedVoice}') } catch {}`,
    `$s.SetOutputToWaveFile('${escapedPath}')`,
    `$s.Speak('${escaped}')`,
    `$s.Dispose()`,
  ].join('; ')
}

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

async function synthesizeSAPI(text, voice) {
  const tmpFile = path.join(os.tmpdir(), `saikou-tts-${Date.now()}.wav`)
  const script = buildSAPIScript(text, voice, tmpFile)
  // Feed the script via stdin (-Command -) instead of the command line, so a
  // double quote in the spoken text or temp path can't break out of the
  // argument (broken synthesis / command injection from local content).
  execSync('powershell -NoProfile -Command -', { input: script, timeout: 10000 })
  try {
    return fs.readFileSync(tmpFile)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

async function synthesize(text, engine, voice) {
  if (engine === 'edge') {
    try {
      return await synthesizeEdge(text, voice)
    } catch (edgeErr) {
      console.error('[TTS] Edge failed, falling back to SAPI:', edgeErr.message)
      // Fall back to SAPI using the same voice if it looks like a SAPI voice name,
      // otherwise use a safe default
      const sapiVoice = voice && !voice.includes('Neural') ? voice : 'Microsoft Zira Desktop'
      return await synthesizeSAPI(text, sapiVoice)
    }
  }
  return await synthesizeSAPI(text, voice)
}

module.exports = { synthesize, buildSAPIScript }
