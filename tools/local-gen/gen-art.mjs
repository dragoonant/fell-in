// M5 art: key art, scenario establishing shots and unit portraits through the local Flux Studio.
//   node tools/local-gen/gen-art.mjs crops                 crop heads of art/unit-concepts into the work dir
//   node tools/local-gen/gen-art.mjs key|scenarios|portraits [--only a,b] [--reseed] [--force]
//   node tools/local-gen/gen-art.mjs sheet <key|scenarios|portraits>   contact sheet PNG in the work dir
// Raw Flux PNGs and the state (seeds) live in the work dir (ART_WORK, default: the OS temp folder), never in the
// repo. Final webp (quality 80) goes to public/assets/art/. Marks (SVG) are written by hand, not generated.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { submit, wait, listFiles, download } from './studio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = process.env.ART_WORK || path.join(os.tmpdir(), 'fell-in-art');
const OUT = path.join(ROOT, 'public', 'assets', 'art');
const batch = JSON.parse(fs.readFileSync(path.join(HERE, 'art-batch.json'), 'utf8'));
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('only')?.split(',');
const pickOnly = (items, key) => items.filter((i) => !i.skip && (!only || only.includes(i[key])));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

fs.mkdirSync(WORK, { recursive: true });
for (const d of ['key', 'scenarios', 'portraits', 'marks']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const statePath = path.join(WORK, 'state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
// Stable seed per asset; --reseed (with --only) moves the named assets to a new seed.
const bumped = new Set();
const seedOf = (k) => {
  const s = (state[k] ||= { seed: 4000 + Object.keys(state).length * 37 });
  if (flag('reseed') && !bumped.has(k)) { s.seed += 7919; bumped.add(k); }
  return s.seed;
};
const webp = (img) => img.webp({ quality: 80 });
const stale = (raw) => flag('force') || flag('reseed') || !fs.existsSync(raw);

async function flux(body, rawPath) {
  const job = await submit('flux', { model: 'klein', batch: 1, ...body });
  const done = await wait('flux', job.id, { timeoutMs: 40 * 60e3 });
  if (done.status !== 'done') throw new Error(`flux ${done.status} ${done.error || ''}`);
  const [f] = await listFiles('flux', job.id, done);
  await download('flux', job.id, f, rawPath);
}

// Runs fn over items in groups of 8; the studio serialises the GPU itself.
async function inChunks(items, fn, n = 8) {
  for (let i = 0; i < items.length; i += n) {
    const res = await Promise.allSettled(items.slice(i, i + n).map(fn));
    res.forEach((r, j) => r.status === 'rejected' && log('FAILED', items[i + j].slug || items[i + j].id, r.reason.message));
  }
}

const rawFile = (kind, slug) => path.join(WORK, 'raw', kind, `${slug}.png`);

async function runKey() {
  await inChunks(pickOnly(batch.key, 'slug'), async (k) => {
    const raw = rawFile('key', k.slug);
    if (stale(raw)) {
      fs.mkdirSync(path.dirname(raw), { recursive: true });
      await flux({ mode: 't2i', prompt: `${k.prompt}. ${batch.style}`, aspect: k.aspect, megapixels: k.megapixels, seed: seedOf(`key/${k.slug}`) }, raw);
    }
    await webp(sharp(raw).resize(k.size[0], k.size[1], { fit: 'cover' })).toFile(path.join(OUT, 'key', `${k.slug}.webp`));
    log('key', k.slug);
  });
  save();
}

async function runScenarios() {
  await inChunks(pickOnly(batch.scenarios, 'id'), async (s) => {
    const raw = rawFile('scenarios', s.id);
    if (stale(raw)) {
      fs.mkdirSync(path.dirname(raw), { recursive: true });
      await flux({ mode: 't2i', prompt: `${s.prompt}. ${batch.style}`, aspect: '16:9', megapixels: 1, seed: seedOf(`scenarios/${s.id}`) }, raw);
    }
    await webp(sharp(raw).resize(768, 432, { fit: 'cover' })).toFile(path.join(OUT, 'scenarios', `${s.id}.webp`));
    log('scenario', s.id);
  });
  save();
}

// ---- portraits
const conceptDir = path.join(ROOT, 'art', 'unit-concepts');
const hasConcept = (id) => fs.existsSync(path.join(conceptDir, `${id}.png`));

async function bounds(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const dark = (x, y) => { const i = (y * W + x) * 3; return (data[i] + data[i + 1] + data[i + 2]) / 3 < 200; };
  let minx = W, maxx = 0, miny = H, maxy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const band = Math.round((maxy - miny) * 0.08);
  let sx = 0, n = 0;
  for (let y = miny; y < miny + band; y++) for (let x = 0; x < W; x++) if (dark(x, y)) { sx += x; n++; }
  return { W, H, miny, maxy, headx: n ? Math.round(sx / n) : Math.round((minx + maxx) / 2) };
}

// Square crop box around the head: auto from the figure's outline, or fixed (x, y, s) in art-batch.json crops.
async function cropBox(id) {
  const c = batch.portrait.crops[id] || batch.portrait.crops.default;
  if (c.s) return { left: c.x, top: c.y, width: c.s, height: c.s };
  const b = await bounds(path.join(conceptDir, `${id}.png`));
  const s = Math.round((c.side ?? 0.34) * (b.maxy - b.miny));
  const left = Math.max(0, Math.min(b.W - s, Math.round(b.headx - s / 2 + (c.dx || 0))));
  const top = Math.max(0, Math.min(b.H - s, Math.round(b.miny - s * 0.12 + (c.dy || 0))));
  return { left, top, width: s, height: s };
}

async function makeCrop(id) {
  const out = path.join(WORK, 'crops', `${id}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(path.join(conceptDir, `${id}.png`)).extract(await cropBox(id)).resize(1024, 1024, { kernel: 'lanczos3' }).png().toFile(out);
  return out;
}

function unitIds() {
  const dir = path.join(ROOT, 'data', '1e', 'units');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return (Array.isArray(j) ? j : j.units).map((u) => ({ id: u.id, name: u.name }));
  });
}

async function runPortraits() {
  const P = batch.portrait;
  await inChunks(pickOnly(unitIds(), 'id'), async (u) => {
    const raw = rawFile('portraits', u.id);
    if (stale(raw)) {
      fs.mkdirSync(path.dirname(raw), { recursive: true });
      if (hasConcept(u.id)) {
        const data = `data:image/png;base64,${fs.readFileSync(await makeCrop(u.id)).toString('base64')}`;
        await flux({ mode: 'edit', prompt: P.editPrompt, images: [data], megapixels: 1, seed: seedOf(`portraits/${u.id}`) }, raw);
      } else {
        const desc = P.textUnits[u.id];
        if (!desc) throw new Error(`no concept and no description for ${u.id}`);
        await flux({ mode: 't2i', prompt: P.textTemplate.replace('{desc}', desc), aspect: '1:1', megapixels: 1, seed: seedOf(`portraits/${u.id}`) }, raw);
      }
    }
    await webp(sharp(raw).resize(256, 256, { fit: 'cover' })).toFile(path.join(OUT, 'portraits', `${u.id}.webp`));
    log('portrait', u.id, hasConcept(u.id) ? '(edit)' : '(text)');
  });
  save();
}

async function grid(files, cw, ch, cols, out) {
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(cw, ch, { fit: 'cover' }).png().toBuffer(), left: (i % cols) * cw, top: Math.floor(i / cols) * ch })));
  await sharp({ create: { width: cols * cw, height: rows * ch, channels: 3, background: '#222' } }).composite(tiles).png().toFile(out);
}

async function sheet(kind) {
  const dir = path.join(OUT, kind);
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  const [cw, ch, cols] = kind === 'portraits' ? [256, 256, 6] : kind === 'scenarios' ? [384, 216, 4] : [480, 270, 3];
  const out = path.join(WORK, `sheet-${kind}.png`);
  await grid(names.map((f) => path.join(dir, f)), cw, ch, cols, out);
  console.log(out, names.join(' '));
}

async function crops() {
  const ids = unitIds().filter((u) => hasConcept(u.id) && (!only || only.includes(u.id)));
  for (const u of ids) await makeCrop(u.id);
  const out = path.join(WORK, 'sheet-crops.png');
  await grid(ids.map((u) => path.join(WORK, 'crops', `${u.id}.png`)), 200, 200, 6, out);
  console.log(out, ids.map((u) => u.id).join(' '));
}

const cmds = { crops, key: runKey, scenarios: runScenarios, portraits: runPortraits, sheet: () => sheet(args[1]) };
if (!cmds[cmd]) { console.error('usage: gen-art.mjs <crops|key|scenarios|portraits|sheet kind> [--only a,b] [--reseed] [--force]'); process.exit(2); }
cmds[cmd]().catch((e) => { console.error(e.message); process.exit(1); });
