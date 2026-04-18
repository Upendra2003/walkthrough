/**
 * measure-audio-delay.js
 *
 * Measures how long PowerShell + SoundPlayer takes to start playing audio
 * after the process is spawned.  Run this, then plug the numbers into
 * PLAYER_STARTUP_MS and PLAYER_STARTUP_MS_QA at the top of session.ts.
 *
 * Usage:
 *   node scripts/measure-audio-delay.js
 *
 * How it works:
 *   1. Creates a WAV of known duration (AUDIO_DURATION_MS of silence).
 *   2. Spawns the same PowerShell command the extension uses.
 *   3. PlaySync() blocks until playback finishes, so:
 *        startup_delay = total_elapsed - AUDIO_DURATION_MS
 *   4. Repeats RUNS times and reports average / min / max.
 */

const { spawn } = require("child_process");
const fs        = require("fs");
const os        = require("os");
const path      = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

const AUDIO_DURATION_MS = 500; // length of the test WAV
const RUNS              = 6;   // how many times to sample
const WARM_UP_RUNS      = 1;   // discarded — first run is always slower (cold PS cache)

// ── Build a minimal PCM WAV of silence ────────────────────────────────────────

function makeSilentWav(durationMs) {
  const sampleRate  = 22050;
  const numSamples  = Math.floor(sampleRate * durationMs / 1000);
  const dataSize    = numSamples * 2; // 16-bit mono = 2 bytes/sample
  const buf         = Buffer.alloc(44 + dataSize, 0);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);           // fmt chunk size
  buf.writeUInt16LE(1,  20);           // PCM
  buf.writeUInt16LE(1,  22);           // mono
  buf.writeUInt32LE(sampleRate,    24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2,  32);           // block align (16-bit mono)
  buf.writeUInt16LE(16, 34);           // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // remaining bytes are already 0 (silence)

  return buf;
}

// ── Run one measurement ───────────────────────────────────────────────────────

function playOnce(wavPath) {
  return new Promise((resolve) => {
    const safe = wavPath.replace(/'/g, "''");
    const ps   =
      `Add-Type -TypeDefinition ` +
      `'using System.Runtime.InteropServices;` +
      `public class WV{` +
      `[DllImport("winmm.dll")]` +
      `public static extern int waveOutSetVolume(System.IntPtr h,uint v);}';` +
      `$v=[uint32](80*655.35);` +
      `[WV]::waveOutSetVolume([System.IntPtr]::Zero,$v -bor ($v -shl 16));` +
      `(New-Object System.Media.SoundPlayer '${safe}').PlaySync()`;

    const start = Date.now();
    const proc  = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps],
                        { stdio: "ignore" });
    proc.once("close", () => resolve(Date.now() - start));
    proc.once("error", () => resolve(Date.now() - start));
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (process.platform !== "win32") {
    console.log("This script measures Windows PowerShell startup delay.");
    console.log("On macOS/Linux the player starts near-instantly (~50 ms).");
    console.log("Set PLAYER_STARTUP_MS = 50 (macOS) or 0 (Linux) in session.ts.");
    process.exit(0);
  }

  const wavPath = path.join(os.tmpdir(), "walkthrough-delay-test.wav");
  fs.writeFileSync(wavPath, makeSilentWav(AUDIO_DURATION_MS));

  const totalRuns = RUNS + WARM_UP_RUNS;
  console.log(`\nMeasuring PowerShell audio startup delay...`);
  console.log(`WAV duration : ${AUDIO_DURATION_MS} ms`);
  console.log(`Runs         : ${RUNS} measured + ${WARM_UP_RUNS} warm-up (discarded)\n`);

  const delays = [];

  for (let i = 0; i < totalRuns; i++) {
    const elapsed = await playOnce(wavPath);
    const startup = elapsed - AUDIO_DURATION_MS;
    const label   = i < WARM_UP_RUNS ? "(warm-up, discarded)" : "";
    console.log(`  Run ${i + 1}: total=${elapsed} ms  →  startup ≈ ${startup} ms  ${label}`);
    if (i >= WARM_UP_RUNS) delays.push(startup);
  }

  fs.unlinkSync(wavPath);

  const avg    = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
  const minVal = Math.min(...delays);
  const maxVal = Math.max(...delays);

  console.log(`\n── Results ──────────────────────────────────────────────────`);
  console.log(`  Average : ${avg} ms`);
  console.log(`  Min     : ${minVal} ms`);
  console.log(`  Max     : ${maxVal} ms`);

  // Q&A path is busier (post-LLM call); add ~150 ms buffer
  const qaDelay = avg + 150;

  console.log(`\n── Paste these into session.ts (top of file) ───────────────`);
  console.log(`  PLAYER_STARTUP_MS    = ${avg}   // regular blocks`);
  console.log(`  PLAYER_STARTUP_MS_QA = ${qaDelay}  // Q&A answer (post-LLM overhead)`);
  console.log(`────────────────────────────────────────────────────────────\n`);
}

main().catch(console.error);
