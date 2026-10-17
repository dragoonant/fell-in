// Generates the game's sfx, music and voice lines with the local Audio Studio (no credits, no ElevenLabs).
//
//   node tools/gen-audio-local.mjs [--kind sfx,music,voice] [--only <id prefix>] [--dry] [--force] [--batch 8] [--retries 2] [--measure]
//
// Reads tools/audio-manifest.json (one studio request per item), submits jobs in batches, converts the studio's
// flac/wav to 44.1 kHz mp3 (sfx and voice mono, music stereo), normalises loudness, and rewrites
// public/audio/manifest.json from what is on disk. Idempotent: an id whose mp3 exists is skipped (--force redoes it).
// To redo one sound, delete its mp3 (or edit the entry's seed/prompt) and rerun with --only <id>.
//
// Decoding, trimming, loop crossfade and normalisation run in headless Chromium (Playwright), because there is no
// ffmpeg here; mp3 encoding uses the @breezystack/lamejs devDependency. Studio protocol: tools/local-gen/studio.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { Mp3Encoder } from '@breezystack/lamejs';
import { submit, wait, listFiles, download } from './local-gen/studio.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioDir = path.join(root, 'public', 'audio');
const cacheDir = path.join(root, 'tools', 'local-gen', 'smoke', 'audio'); // gitignored raw studio output
const SR = 44100;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const kinds = opt('kind', 'sfx,music,voice').split(',');
const only = opt('only', '');
const BATCH = Number(opt('batch', 8));
const RETRIES = Number(opt('retries', 2));
const KBPS = { sfx: 96, voice: 64, music: 128 };

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'audio-manifest.json'), 'utf8'));
const T = manifest.targets;
const dirFor = (k) => path.join(audioDir, k);
const mp3Path = (it) => path.join(dirFor(it.kind), `${it.id}.mp3`);

function body(it, attempt) {
  const seed = it.seed + attempt * 1000;
  if (it.kind === 'sfx') return { mode: 'sfx', prompt: it.prompt, negative: it.avoid || '', seconds: it.seconds, seed, ...(it.steps ? { steps: it.steps } : {}) };
  if (it.kind === 'music') return { mode: 'music', prompt: it.prompt, lyrics: '[Instrumental]', duration: it.seconds, bpm: it.bpm, key: it.key, seed, ...(it.steps ? { steps: it.steps } : {}) };
  return { mode: 'voice', model: it.model, speaker: it.speaker, instruct: it.instruct, text: it.text, language: it.language || 'English', seed };
}

/* ---------------------------------------------------------------- in-browser DSP */
// Runs in Chromium: decode (resampled to 44.1 kHz), downmix, trim silence, fade, loop crossfade, normalise.
async function dsp(b64, o) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer);
  let ch = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice());
  if (o.stereo) { if (ch.length === 1) ch = [ch[0], ch[0].slice()]; else ch = [ch[0], ch[1]]; }
  else if (ch.length > 1) { const m = new Float32Array(ch[0].length); for (const c of ch) for (let i = 0; i < m.length; i++) m[i] += c[i] / ch.length; ch = [m]; }
  const peakOf = (cs) => { let p = 0; for (const c of cs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; } return p; };
  const rawPeak = peakOf(ch);
  let clipped = 0, total = 0;
  for (const c of ch) { total += c.length; for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) >= 0.999) clipped++; }
  let uncropped = 0;
  const slice = (cs, a, b) => cs.map((c) => c.slice(a, b));
  if (o.trim) { // cut leading/trailing silence below -46 dB of peak
    const thr = rawPeak * Math.pow(10, (o.trimDb ?? -46) / 20), n = ch[0].length, w = 220;
    const loud = (i) => { let m = 0; for (const c of ch) for (let k = i; k < Math.min(n, i + w); k++) m = Math.max(m, Math.abs(c[k])); return m > thr; };
    let a = 0; while (a < n && !loud(a)) a += w;
    let b = n; while (b > a && !loud(b - w)) b -= w;
    a = Math.max(0, a - 110); b = Math.min(n, b + (o.tailPad || 1500));
    ch = slice(ch, a, b);
    uncropped = ch[0].length / 44100;
    if (o.maxDur && ch[0].length > o.maxDur * 44100) ch = slice(ch, 0, Math.round(o.maxDur * 44100));
  }
  if (o.loop) { // equal-power crossfade of the tail into the head so the file loops seamlessly
    const n = ch[0].length, X = Math.min(Math.round(o.loopFade * 44100), Math.floor(n / 4));
    ch = ch.map((c) => { const out = c.slice(0, n - X); for (let i = 0; i < X; i++) { const w = i / X; out[i] = c[i] * Math.sin(w * Math.PI / 2) + c[n - X + i] * Math.cos(w * Math.PI / 2); } return out; });
  }
  const n = ch[0].length, fi = Math.round(o.fadeIn * 44100), fo = Math.min(Math.round(o.fadeOut * 44100), Math.floor(n / 2));
  for (const c of ch) { for (let i = 0; i < fi && i < n; i++) c[i] *= i / fi; for (let i = 0; i < fo; i++) c[n - 1 - i] *= (i / fo) * (i / fo) * (3 - 2 * (i / fo)); }
  // loudness: RMS on channel 0 (same as tools/measure-audio.ts), limited by a peak ceiling
  let sum = 0; for (let i = 0; i < n; i++) sum += ch[0][i] * ch[0][i];
  const rms0 = Math.sqrt(sum / n), pk0 = peakOf(ch);
  let gain = Math.min(o.rms / Math.max(rms0, 1e-9), o.peak / Math.max(pk0, 1e-9));
  if (o.soft && gain * pk0 >= o.peak * 0.999 && gain * rms0 < o.rms) { // spiky sound: lift the body with a soft knee, never past the target
    const knee = 0.5, lim = (x) => { const a = Math.abs(x); return a <= knee ? x : Math.sign(x) * (knee + (o.peak - knee) * Math.tanh((a - knee) / (o.peak - knee))); };
    const rmsAt = (g) => { let q = 0; for (let i = 0; i < n; i++) { const v = lim(ch[0][i] * g); q += v * v; } return Math.sqrt(q / n); };
    let lo = gain, hi = gain * 8;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (rmsAt(mid) < o.rms) lo = mid; else hi = mid; }
    gain = lo;
    for (const c of ch) for (let i = 0; i < n; i++) c[i] = lim(c[i] * gain);
  } else for (const c of ch) for (let i = 0; i < n; i++) c[i] *= gain;
  let s2 = 0, pk = 0;
  for (let i = 0; i < n; i++) s2 += ch[0][i] * ch[0][i];
  pk = peakOf(ch);
  const rms = Math.sqrt(s2 / n);
  const enc = (c) => { const i16 = new Int16Array(c.length); for (let i = 0; i < c.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))); let s = ''; const u = new Uint8Array(i16.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return { pcm: ch.map(enc), stats: { rms, peak: pk, crest: pk / Math.max(rms, 1e-9), dur: n / 44100, uncropped, rawPeak, rawClipFrac: clipped / total, gainDb: 20 * Math.log10(gain) } };
}

function dspOptions(it) {
  if (it.kind === 'sfx') return { stereo: false, trim: true, trimDb: it.trimDb ?? -30, maxDur: it.seconds, fadeIn: 0.002, fadeOut: Math.min(0.12, it.seconds * 0.1), rms: it.rms ?? T.sfxRms, peak: T.sfxPeak, soft: !/^shot-|^explosion/.test(it.id), tailPad: 5000 };
  if (it.kind === 'voice') return { stereo: false, trim: true, fadeIn: 0.005, fadeOut: 0.06, rms: it.rms ?? T.voiceRms, peak: T.sfxPeak, tailPad: 4000 };
  return { stereo: true, trim: false, loop: !!it.loop, loopFade: 2.0, fadeIn: it.loop ? 0 : 0.01, fadeOut: it.loop ? 0 : (it.seconds > 30 ? 3 : 1.2), rms: it.rms ?? T.musicRms, peak: T.sfxPeak };
}

function encodeMp3(pcmB64, kbps) {
  const chans = pcmB64.map((b) => new Int16Array(Uint8Array.from(Buffer.from(b, 'base64')).buffer));
  const enc = new Mp3Encoder(chans.length, SR, kbps);
  const parts = [];
  const N = chans[0].length;
  for (let i = 0; i < N; i += 1152) {
    const l = chans[0].subarray(i, i + 1152);
    const out = chans.length === 2 ? enc.encodeBuffer(l, chans[1].subarray(i, i + 1152)) : enc.encodeBuffer(l);
    if (out.length) parts.push(Buffer.from(out));
  }
  const end = enc.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

// mp3 coding overshoots sharp peaks by about 1 dB, so decode what was written and, if it would clip, turn the PCM down and re-encode.
async function encodeSafe(page, pcmB64, kbps) {
  let chans = pcmB64.map((b) => new Int16Array(Uint8Array.from(Buffer.from(b, 'base64')).buffer));
  let mp3;
  for (let pass = 0; pass < 8; pass++) {
    mp3 = encodeMp3(chans.map((c) => Buffer.from(c.buffer).toString('base64')), kbps);
    const peak = await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer);
      let pk = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) for (const v of buf.getChannelData(ch)) pk = Math.max(pk, Math.abs(v));
      return pk;
    }, mp3.toString('base64'));
    if (peak <= 0.97) break;
    const k = peak >= 0.999 ? 0.85 : 0.95 / peak; // a decoded 1.00 is clipped, so the true overshoot is unknown
    chans = chans.map((c) => Int16Array.from(c, (v) => Math.round(v * k)));
  }
  return mp3;
}

// Reasons a take should be redone with a new seed.
function problems(it, s) {
  const bad = [];
  if (s.rawPeak < 0.01) bad.push('silent');
  if (s.rawClipFrac > 0.02) bad.push(`clipped ${(s.rawClipFrac * 100).toFixed(1)}%`);
  if (it.kind === 'sfx' && s.dur < 0.1) bad.push(`too short ${s.dur.toFixed(2)}s`);
  if (it.kind === 'sfx' && /^shot-/.test(it.id) && s.crest < 7) bad.push(`transient too soft (crest ${s.crest.toFixed(1)}, want 8+)`);
  if (it.kind === 'sfx' && /^shot-/.test(it.id) && s.uncropped >= Math.max(1, it.seconds) * 0.99) bad.push('never decays (likely music or noise)');
  if (it.kind === 'voice' && s.dur < 0.5) bad.push('voice too short');
  if (it.kind === 'music' && s.crest > 14) bad.push('music crest too high (not music?)');
  return bad;
}

/* ---------------------------------------------------------------- manifest on disk */
function writeDiskManifest() {
  const m = { version: 1, sfx: {}, music: {}, voice: {} };
  for (const it of manifest.items) if (fs.existsSync(mp3Path(it))) m[it.kind][it.id] = `audio/${it.kind}/${it.id}.mp3`;
  const sort = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  m.sfx = sort(m.sfx); m.music = sort(m.music); m.voice = sort(m.voice);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(path.join(audioDir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  return m;
}

async function launchBrowser() {
  for (const channel of [undefined, 'chrome', 'msedge']) { // bundled Chromium if installed, else the system Chrome or Edge
    try { return await chromium.launch(channel ? { channel } : {}); } catch { /* try the next */ }
  }
  throw new Error('no browser for audio decoding: run `npx playwright install chromium`, or install Chrome or Edge');
}

// --measure [prefix]: decode the mp3s on disk and print RMS, peak, crest and length (what tools/measure-audio.ts
// does, but for the public/audio/{sfx,music,voice}/ layout and with a system browser).
if (flag('measure')) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  for (const it of manifest.items.filter((i) => kinds.includes(i.kind) && i.id.startsWith(only))) {
    if (!fs.existsSync(mp3Path(it))) continue;
    const b64 = fs.readFileSync(mp3Path(it)).toString('base64');
    const r = await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer);
      const c = buf.getChannelData(0); let q = 0, pk = 0;
      for (const v of c) { q += v * v; pk = Math.max(pk, Math.abs(v)); }
      const rms = Math.sqrt(q / c.length);
      return { rms, pk, crest: pk / rms, dur: buf.duration, ch: buf.numberOfChannels, sr: buf.sampleRate };
    }, b64);
    console.log(`${(it.kind + '/' + it.id).padEnd(34)} rms ${r.rms.toFixed(3)} peak ${r.pk.toFixed(2)} crest ${r.crest.toFixed(1)} ${r.dur.toFixed(2)}s ${r.ch}ch ${r.sr}Hz ${(fs.statSync(mp3Path(it)).size / 1024).toFixed(0)}KB`);
  }
  await browser.close();
  process.exit(0);
}

/* ---------------------------------------------------------------- main */
const selected = manifest.items.filter((it) => kinds.includes(it.kind) && it.id.startsWith(only));
const todo = selected.filter((it) => flag('force') || !fs.existsSync(mp3Path(it)));
console.log(`[gen-audio-local] ${selected.length} selected, ${selected.length - todo.length} already on disk, ${todo.length} to generate`);
if (flag('dry')) {
  for (const it of todo) console.log(`  ${it.kind.padEnd(5)} ${it.id.padEnd(22)} ${JSON.stringify(body(it, 0)).slice(0, 150)}`);
  writeDiskManifest();
  process.exit(0);
}

const report = [];
if (todo.length) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto('about:blank');
  const t0 = Date.now();
  const stamp = () => `[${Math.round((Date.now() - t0) / 1000)}s]`;

  async function runOne(it, attempt) {
    const job = await submit('audio', body(it, attempt));
    const done = await wait('audio', job.id, { timeoutMs: 45 * 60e3 });
    if (done.status !== 'done') throw new Error(`${done.status}: ${done.error || ''}`);
    const files = await listFiles('audio', job.id, done);
    const f = files.find((n) => /\.(flac|wav)$/.test(n)) || files[0];
    const raw = path.join(cacheDir, `${it.kind}-${it.id}-a${attempt}-${f}`);
    await download('audio', job.id, f, raw);
    const b64 = fs.readFileSync(raw).toString('base64');
    const res = await page.evaluate(`(${dsp.toString()})(${JSON.stringify(b64)}, ${JSON.stringify(dspOptions(it))})`);
    return res;
  }

  let queue = todo.map((it) => ({ it, attempt: 0 }));
  while (queue.length) {
    const batch = queue.splice(0, BATCH);
    console.log(`${stamp()} batch of ${batch.length}: ${batch.map((b) => b.it.id).join(', ')}`);
    const results = await Promise.all(batch.map(async ({ it, attempt }) => {
      try { return { it, attempt, res: await runOne(it, attempt) }; } catch (e) { return { it, attempt, error: e.message }; }
    }));
    for (const { it, attempt, res, error } of results) {
      if (error) {
        console.log(`${stamp()} FAIL ${it.id}: ${error}`);
        if (attempt < RETRIES) queue.push({ it, attempt: attempt + 1 }); else report.push({ id: it.id, ok: false, why: error });
        continue;
      }
      const bad = problems(it, res.stats);
      const s = res.stats;
      if (bad.length && attempt < RETRIES) {
        console.log(`${stamp()} RETRY ${it.id} (${bad.join('; ')})`);
        queue.push({ it, attempt: attempt + 1 });
        continue;
      }
      fs.mkdirSync(dirFor(it.kind), { recursive: true });
      fs.writeFileSync(mp3Path(it), await encodeSafe(page, res.pcm, KBPS[it.kind]));
      console.log(`${stamp()} ok ${it.kind} ${it.id} rms ${s.rms.toFixed(3)} peak ${s.peak.toFixed(2)} crest ${s.crest.toFixed(1)} ${s.dur.toFixed(2)}s${bad.length ? ` (kept despite: ${bad.join('; ')})` : ''}`);
      report.push({ id: it.id, ok: true, attempt, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(3)])), flags: bad });
      writeDiskManifest();
    }
  }
  await browser.close();
}

const m = writeDiskManifest();
let bytes = 0;
const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk(audioDir);
console.log(`[gen-audio-local] manifest: ${Object.keys(m.sfx).length} sfx, ${Object.keys(m.music).length} music, ${Object.keys(m.voice).length} voice; public/audio ${(bytes / 1048576).toFixed(1)} MB`);
const failed = report.filter((r) => !r.ok);
if (failed.length) { console.log('FAILED:', failed.map((f) => `${f.id} (${f.why})`).join('; ')); process.exit(1); }
