"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioPlayer = void 0;
const child_process_1 = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const TMP_FILE = path.join(os.tmpdir(), "walkthrough-narr.wav");
/**
 * Cross-platform WAV player backed by a child process.
 * stop() kills the process; play() always resolves (never rejects).
 *
 * `AudioPlayer.volume` (0–100) is read at play-time so the panel slider
 * takes effect on the next block without restarting anything.
 */
class AudioPlayer {
    constructor() {
        this.proc = null;
    }
    play(wavBuffer) {
        fs.writeFileSync(TMP_FILE, wavBuffer);
        return new Promise((resolve) => {
            const [cmd, args] = AudioPlayer.command(TMP_FILE);
            this.proc = (0, child_process_1.spawn)(cmd, args, { stdio: "ignore", shell: false });
            const done = () => {
                this.proc = null;
                resolve();
            };
            this.proc.once("close", done);
            this.proc.once("error", done); // resolve on error; caller handles fallback
        });
    }
    /** Kill the player process; play() will resolve immediately after. */
    stop() {
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }
    static command(filePath) {
        const vol = Math.max(0, Math.min(100, AudioPlayer.volume));
        switch (process.platform) {
            case "darwin": {
                // afplay -v accepts 0.0–1.0 (values > 1.0 amplify; we cap at 1.0)
                const v = (vol / 100).toFixed(3);
                return ["afplay", ["-v", v, filePath]];
            }
            case "win32": {
                // Set wave-out volume via winmm.dll P/Invoke, then play with SoundPlayer.
                // Each spawn is a fresh PowerShell session so Add-Type is safe to repeat.
                const safe = filePath.replace(/'/g, "''"); // escape single quotes in path
                const ps = `Add-Type -TypeDefinition ` +
                    `'using System.Runtime.InteropServices;` +
                    `public class WV{` +
                    `[DllImport("winmm.dll")]` +
                    `public static extern int waveOutSetVolume(System.IntPtr h,uint v);}';` +
                    `$v=[uint32](${vol}*655.35);` +
                    `[WV]::waveOutSetVolume([System.IntPtr]::Zero,$v -bor ($v -shl 16));` +
                    `(New-Object System.Media.SoundPlayer '${safe}').PlaySync()`;
                return ["powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]];
            }
            default: // Linux — aplay has no volume flag; volume control not supported
                return ["aplay", [filePath]];
        }
    }
}
exports.AudioPlayer = AudioPlayer;
/** System audio level 0–100.  Updated by the volume slider in the panel. */
AudioPlayer.volume = 80;
//# sourceMappingURL=audioPlayer.js.map