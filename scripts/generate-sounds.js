// Generates the app's small, royalty-free sound effects as WAV files.
// Run with: node scripts/generate-sounds.js
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const out = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(out, { recursive: true });

// A note is [frequencyHz, startSeconds, durationSeconds, gain].
function render(notes, tail = 0.05) {
  const total = Math.max(...notes.map(([, s, d]) => s + d)) + tail;
  const samples = new Float32Array(Math.ceil(total * RATE));
  for (const [freq, start, dur, gain] of notes) {
    const first = Math.floor(start * RATE);
    const count = Math.floor(dur * RATE);
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.008);
      const decay = Math.pow(1 - i / count, 2);
      const tone = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t);
      samples[first + i] += tone * attack * decay * gain;
    }
  }
  return samples;
}

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(out, name + '.wav'), Buffer.concat([h, data]));
}

const C4 = 261.63, F3 = 174.61, G3 = 196, G4 = 392, A4 = 440;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5;

writeWav('tap', render([[880, 0, 0.07, 0.4]]));
writeWav('snap', render([[220, 0, 0.05, 0.6], [C6, 0.02, 0.14, 0.4]]));
writeWav('chime', render([[C5, 0, 0.18, 0.35], [G5, 0.08, 0.28, 0.35]]));
writeWav('oops', render([[G4, 0, 0.14, 0.25], [330, 0.1, 0.2, 0.2]]));
writeWav('star', render([[E6, 0, 0.2, 0.3]]));
writeWav('victory', render([
  [C5, 0, 0.2, 0.35], [E5, 0.14, 0.2, 0.35], [G5, 0.28, 0.2, 0.35], [C6, 0.42, 0.6, 0.4], [E6, 0.42, 0.6, 0.2],
]));

// A gentle loop. Every note fades out before the loop point, so it repeats cleanly.
const beat = 0.5;
const melody = [C5, E5, G5, E5, D5, E5, C5, G4, A4, C5, E5, C5, D5, G5, E5, C5];
const bass = [C4, C4, F3, G3];
const notes = [];
melody.forEach((f, i) => notes.push([f, i * beat, beat * 1.2, 0.16]));
bass.forEach((f, bar) => notes.push([f, bar * 4 * beat, beat * 3.6, 0.14]));
writeWav('music', render(notes, 0.2));
