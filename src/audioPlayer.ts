import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const TMP_FILE = path.join(os.tmpdir(), "walkthrough-narr.wav");

/**
 * Cross-platform WAV player backed by a child process.
 * stop() kills the process; play() always resolves (never rejects).
 */
export class AudioPlayer {
  private proc: ChildProcess | null = null;

  play(wavBuffer: Buffer): Promise<void> {
    fs.writeFileSync(TMP_FILE, wavBuffer);

    return new Promise((resolve) => {
      const [cmd, args] = AudioPlayer.command(TMP_FILE);
      this.proc = spawn(cmd, args, { stdio: "ignore", shell: false });

      const done = () => {
        this.proc = null;
        resolve();
      };

      this.proc.once("close", done);
      this.proc.once("error", done); // resolve on error; caller handles fallback
    });
  }

  /** Kill the player process; play() will resolve immediately after. */
  stop(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  private static command(filePath: string): [string, string[]] {
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
