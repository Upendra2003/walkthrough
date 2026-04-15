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
        switch (process.platform) {
            case "darwin":
                return ["afplay", [filePath]];
            case "win32":
                // System.Media.SoundPlayer supports WAV natively — no extra tools needed.
                return [
                    "powershell",
                    [
                        "-NoProfile",
                        "-NonInteractive",
                        "-Command",
                        `(New-Object System.Media.SoundPlayer '${filePath}').PlaySync()`,
                    ],
                ];
            default: // Linux
                return ["aplay", [filePath]];
        }
    }
}
exports.AudioPlayer = AudioPlayer;
//# sourceMappingURL=audioPlayer.js.map