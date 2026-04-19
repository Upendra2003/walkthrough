"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioPlayer = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
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
        this.playStartTime = 0;
    }
    /** Milliseconds elapsed since play() was called on the current clip. */
    get elapsedMs() {
        return this.playStartTime > 0 ? Date.now() - this.playStartTime : 0;
    }
    play(wavBuffer) {
        this.playStartTime = Date.now();
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