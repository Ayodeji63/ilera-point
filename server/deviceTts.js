import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function synthesizeWithDeviceVoice(text, signal) {
  const directory = await mkdtemp(join(tmpdir(), "ilera-tts-"));
  const textPath = join(directory, "speech.txt");
  const audioPath = join(directory, "speech.wav");
  try {
    await writeFile(textPath, text, "utf8");
    await execFileAsync("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `flite=textfile=${textPath}:voice=slt`,
      "-ar", "24000", "-ac", "1", "-y", audioPath,
    ], { signal, timeout: 5000, maxBuffer: 1024 * 1024 });
    const audio = await readFile(audioPath);
    if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") throw new Error("The kiosk device voice returned invalid audio.");
    return audio;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
