import fs from 'fs';
import path from 'path';
import https from 'https';
import { WordTiming } from './types';

export interface TTSResult {
  audioPath: string;
  durationMs: number;
  wordTimings: WordTiming[];
}

export async function generateNarrationAudio(
  text: string,
  apiKey: string,
  outputPath: string,
  languageCode = 'en-IN'
): Promise<TTSResult> {
  const payload = JSON.stringify({
    inputs: [text],
    target_language_code: languageCode,
    speaker: 'priya',
    speech_sample_rate: 22050,
    enable_preprocessing: true,
    model: 'bulbul:v3'
  });

  const audioBase64 = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.sarvam.ai',
        path: '/text-to-speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': apiKey,
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.audios?.[0]) resolve(json.audios[0]);
            else reject(new Error(`Sarvam error: ${data}`));
          } catch (e) {
            reject(new Error(`Parse error: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  const audioBuffer = Buffer.from(audioBase64, 'base64');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, audioBuffer);

  const durationMs = readWavDurationMs(audioBuffer);
  const wordTimings = buildWordTimings(text, durationMs);

  console.log(`✅ TTS done: ${path.basename(outputPath)} | ${durationMs}ms | ${wordTimings.length} words`);

  return { audioPath: outputPath, durationMs, wordTimings };
}

function readWavDurationMs(buffer: Buffer): number {
  try {
    const byteRate = buffer.readUInt32LE(28);
    let dataSize = 0;
    for (let i = 12; i < buffer.length - 8; i++) {
      if (buffer.toString('ascii', i, i + 4) === 'data') {
        dataSize = buffer.readUInt32LE(i + 4);
        break;
      }
    }
    if (byteRate === 0 || dataSize === 0) return 4000;
    return Math.round((dataSize / byteRate) * 1000);
  } catch {
    return 4000;
  }
}

function buildWordTimings(text: string, totalMs: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const weights = words.map((w) => {
    let weight = w.replace(/[^a-zA-Z]/g, '').length || 1;
    if (/[,;:]$/.test(w)) weight += 2;
    if (/[.!?]$/.test(w)) weight += 4;
    return weight;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const timings: WordTiming[] = [];
  let cursor = 0;

  for (let i = 0; i < words.length; i++) {
    const duration = (weights[i] / totalWeight) * totalMs;
    timings.push({
      word: words[i].replace(/[^\w']/g, ''),
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + duration)
    });
    cursor += duration;
  }

  return timings;
}
