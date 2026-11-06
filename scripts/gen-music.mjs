// Synthesize a neutral background score with plain Node, no dependencies.
// Reads the beat grid and duration from the mounted content pack.
// Writes 16-bit PCM WAV; point preset.audio.src at it (or convert to MP3).
import fs from "node:fs";
import path from "node:path";

const presetPath = path.resolve("content/presets/render.json");
const preset = fs.existsSync(presetPath)
  ? JSON.parse(fs.readFileSync(presetPath, "utf8"))
  : {};
const SR = 44100;
const BPM = preset.bpm || 96;
const BEAT = 60 / BPM;
const FPS = preset.fps || 30;
const lastFrame = (preset.scenes || []).reduce(
  (max, scene) => Math.max(max, scene.end || 0),
  0
);
const DURATION = Math.ceil(lastFrame / FPS) + 2; // Cover the full video plus tail.
const total = Math.floor(SR * DURATION);
const data = new Float32Array(total);

// C major scale (plus upper octave), in Hz.
const scale = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
const bassScale = [65.41, 73.42, 82.41, 87.31, 98.0, 110.0];

const clamp1 = (v) => Math.max(-1, Math.min(1, v));

function addTone(freq, startT, durT, amp, type = "triangle") {
  const start = Math.floor(startT * SR);
  const dur = Math.floor(durT * SR);
  const a = 0.008; // attack
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (idx >= total) break;
    const t = i / SR;
    // Exponential decay envelope for a plucked-string feel.
    const env = t < a ? t / a : Math.exp(-(t - a) / (durT * 0.45));
    const ph = 2 * Math.PI * freq * t;
    let s;
    if (type === "sine") s = Math.sin(ph);
    else if (type === "triangle") s = (2 / Math.PI) * Math.asin(Math.sin(ph));
    else if (type === "saw") s = 2 * (freq * t - Math.floor(freq * t + 0.5));
    else s = Math.sin(ph);
    data[idx] += s * env * amp;
  }
}

// Soft sine kick on every beat for groove.
function addKick(startT, amp = 0.18) {
  const start = Math.floor(startT * SR);
  const dur = Math.floor(0.12 * SR);
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (idx >= total) break;
    const t = i / SR;
    const freq = 130 - 90 * (t / 0.12);
    const env = Math.exp(-t / 0.05);
    data[idx] += Math.sin(2 * Math.PI * freq * t) * env * amp;
  }
}

// Sustained bass pad with slow vibrato.
function addPad(freq, amp = 0.05) {
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const env = t < 0.5 ? t / 0.5 : 1;
    const vib = 1 + 0.01 * Math.sin(2 * Math.PI * 0.2 * t);
    data[i] += Math.sin(2 * Math.PI * freq * vib * t) * env * amp;
  }
}

// Scale-degree pattern, 16 beats per cycle.
const melody = [0, 2, 4, 2, 4, 3, 1, 4, 5, 4, 2, 4, 3, 2, 0, 2,
                0, 2, 4, 5, 4, 3, 2, 1, 0, 2, 4, 2, 5, 4, 2, 0];

const beatsTotal = Math.floor(DURATION / BEAT);
let mIdx = 0;
for (let b = 0; b < beatsTotal; b++) {
  const t = b * BEAT;
  addKick(t, b % 4 === 0 ? 0.22 : 0.14); // Accent the downbeat.
  const deg = melody[mIdx % melody.length];
  mIdx++;
  addTone(scale[deg], t, BEAT * 0.9, 0.16, "triangle");
  if (b % 4 === 0) addTone(scale[deg] * 2, t + 0.02, BEAT * 0.5, 0.06, "sine");
  if (b % 4 === 0) addTone(bassScale[(b / 4) % bassScale.length], t, BEAT * 3.6, 0.12, "sine");
}

addPad(65.41, 0.045);
addPad(98.0, 0.03);

// Normalize to avoid clipping.
let peak = 0;
for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(data[i]));
const norm = peak > 0 ? 0.92 / peak : 1;
for (let i = 0; i < total; i++) data[i] *= norm;

function writeWav(filePath, float32, sr) {
  const numCh = 1;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sr * blockAlign;
  const dataSize = float32.length * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < float32.length; i++) {
    buf.writeInt16LE(Math.floor(clamp1(float32[i]) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

const outDir = path.resolve("public");
fs.mkdirSync(outDir, { recursive: true });
writeWav(path.join(outDir, "bgm.wav"), data, SR);
console.log(
  "WAV written: public/bgm.wav",
  "duration(s)=", (total / SR).toFixed(2),
  "bpm=", BPM,
  "peak=", peak.toFixed(3)
);
console.log('Set preset.audio = { "src": "bgm.wav", "volume": 0.55 } and place the file in your pack assets/ folder.');
