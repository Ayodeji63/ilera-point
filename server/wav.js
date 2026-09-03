function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("Sahara returned invalid WAV audio");
  let offset = 12;
  let format;
  let pcm;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === "data") pcm = buffer.subarray(start, Math.min(start + size, buffer.length));
    offset = start + size + (size % 2);
  }
  if (!format || !pcm) throw new Error("Sahara returned an incomplete WAV file");
  return { format, pcm };
}

export function mergeWavBuffers(buffers, pausesMs = []) {
  if (!buffers.length) throw new Error("No Sahara audio chunks were returned");
  const parsed = buffers.map(parseWav);
  const format = parsed[0].format;
  const mismatch = parsed.some(({ format: current }) => current.audioFormat !== format.audioFormat || current.channels !== format.channels || current.sampleRate !== format.sampleRate || current.bitsPerSample !== format.bitsPerSample);
  if (mismatch) throw new Error("Sahara returned audio chunks with incompatible WAV formats");
  const pcmParts = [];
  parsed.forEach(({ pcm }, index) => {
    pcmParts.push(pcm);
    if (index >= parsed.length - 1) return;
    const milliseconds = pausesMs[index] || 0;
    const bytes = Math.floor((format.byteRate * milliseconds) / 1000 / format.blockAlign) * format.blockAlign;
    if (bytes > 0) pcmParts.push(Buffer.alloc(bytes));
  });
  const pcm = Buffer.concat(pcmParts);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format.audioFormat, 20); header.writeUInt16LE(format.channels, 22); header.writeUInt32LE(format.sampleRate, 24); header.writeUInt32LE(format.byteRate, 28); header.writeUInt16LE(format.blockAlign, 32); header.writeUInt16LE(format.bitsPerSample, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
