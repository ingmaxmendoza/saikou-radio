// main/tts.js
const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')

function buildSAPIScript(text, voice, outPath) {
  const escaped = text.replace(/'/g, "''")
  return [
    `Add-Type -AssemblyName System.Speech`,
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
    `try { $s.SelectVoice('${voice}') } catch {}`,
    `$s.SetOutputToWaveFile('${outPath}')`,
    `$s.Speak('${escaped}')`,
    `$s.Dispose()`,
  ].join('; ')
}

async function synthesizeEdge(text, voice) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const readable = await tts.toStream(text)
  return new Promise((resolve, reject) => {
    const chunks = []
    readable.on('data', (chunk) => chunks.push(chunk))
    readable.on('end', () => resolve(Buffer.concat(chunks)))
    readable.on('error', reject)
  })
}

async function synthesizeSAPI(text, voice) {
  const tmpFile = path.join(os.tmpdir(), `saikou-tts-${Date.now()}.wav`)
  const script = buildSAPIScript(text, voice, tmpFile)
  execSync(`powershell -NoProfile -Command "${script}"`)
  const buf = fs.readFileSync(tmpFile)
  fs.unlinkSync(tmpFile)
  return buf
}

async function synthesize(text, engine, voice) {
  if (engine === 'edge') {
    try {
      return await synthesizeEdge(text, voice)
    } catch {
      return await synthesizeSAPI(text, 'Microsoft Zira Desktop')
    }
  }
  return await synthesizeSAPI(text, voice)
}

module.exports = { synthesize, buildSAPIScript }
