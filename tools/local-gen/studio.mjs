// Shared client for the three local studios (Flux, Audio, Hunyuan). Plain ESM, Node 24, no dependencies.
//
//   import { submit, wait, listFiles, download } from './studio.mjs'
//   CLI: node tools/local-gen/studio.mjs <flux|audio|hunyuan> '<json body>' [--out dir] [--pick N] [--timeout minutes]
//
// Body strings of the form "@file:<path>" are replaced by a data URL of that file (flux images[], audio ref)
// and "@b64:<path>" by raw base64 (hunyuan image). A body argument of "@<path>.json" is read from that file.
// STUDIO_HOST overrides the host (default 127.0.0.1). See README.md and docs/spec/sources/LOCAL-STUDIOS.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIOS = {
  flux: { port: 7880, done: ['done'], fileRoute: 'files' },
  audio: { port: 7890, done: ['done'], fileRoute: 'files' },
  hunyuan: { port: 7860, done: ['completed'], fileRoute: 'api' },
};
const FAILED = ['failed', 'cancelled'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function baseUrl(studio) {
  const s = STUDIOS[studio];
  if (!s) throw new Error(`unknown studio "${studio}" (use ${Object.keys(STUDIOS).join(', ')})`);
  return `http://${process.env.STUDIO_HOST || '127.0.0.1'}:${s.port}`;
}

async function http(studio, route, init) {
  const res = await fetch(baseUrl(studio) + route, init);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(`${studio} ${route}: ${res.status} ${data.error || text.slice(0, 200)}`), { status: res.status });
  return data;
}

const JSON_POST = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
export const submit = (studio, body) => http(studio, '/api/jobs', { ...JSON_POST, body: JSON.stringify(body) });
export const status = (studio, id) => http(studio, `/api/jobs/${id}`);
export const cancel = (studio, id) => http(studio, `/api/jobs/${id}/cancel`, { method: 'POST' });
export const pick = (studio, id, index = 0) => http(studio, `/api/jobs/${id}/pick`, { ...JSON_POST, body: JSON.stringify({ index }) });

const isTerminal = (studio, j) => STUDIOS[studio].done.includes(j.status) || FAILED.includes(j.status);

// Polls until done/failed/cancelled. Connection refused (studio restarting) is tolerated for 2 minutes.
// Hunyuan text jobs stop at awaiting_pick: pass autoPick (an index) to pick and carry on, otherwise the job
// is returned as it is.
export async function wait(studio, id, { onLog, timeoutMs = 30 * 60e3, intervalMs = 1500, autoPick } = {}) {
  const t0 = Date.now();
  let downSince = 0, lastLine = '', j;
  for (;;) {
    try {
      j = await status(studio, id);
      downSince = 0;
    } catch (e) {
      if (e.status) throw e; // the studio answered with an error (404 etc.)
      downSince ||= Date.now();
      if (Date.now() - downSince > 120e3) throw new Error(`${studio} unreachable for 2 minutes: ${e.cause?.code || e.message}`);
      onLog?.(`${studio} not answering (${e.cause?.code || e.message}), retrying`);
      await sleep(3000);
      continue;
    }
    const pct = Math.round((j.progress || 0) * 100);
    const qpos = j.queuePos ?? j.queuePosition ?? 0;
    const line = `${j.status} ${pct}% ${j.phase || j.stage || ''}${qpos > 1 ? ` (queue ${qpos})` : ''}${j.waitingFor ? ` waiting for ${j.waitingFor}` : ''}`.trim();
    if (line !== lastLine) { onLog?.(line); lastLine = line; }
    if (isTerminal(studio, j)) return j;
    if (j.status === 'awaiting_pick') {
      if (autoPick == null) return j;
      await pick(studio, id, autoPick);
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out after ${Math.round(timeoutMs / 60e3)} min waiting for ${studio} job ${id} (last: ${lastLine})`);
    await sleep(intervalMs);
  }
}

// Output file names of a finished job (inputs excluded).
export async function listFiles(studio, id, job) {
  const j = job || await status(studio, id);
  if (studio === 'flux') return j.images || [];
  if (studio === 'audio') return [...(j.audios || []), ...(j.videoOut ? [j.videoOut] : [])];
  const out = (j.files || []).filter((f) => f !== 'input.png');
  if (j.model && !out.includes(j.model)) out.push(j.model);
  return out;
}

export async function download(studio, id, name, destPath) {
  const route = STUDIOS[studio].fileRoute === 'api' ? `/api/jobs/${id}/files/${name}` : `/files/${id}/${name}`;
  const res = await fetch(baseUrl(studio) + route);
  if (!res.ok) throw new Error(`download ${studio} ${name}: ${res.status}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
  return destPath;
}

/* ------------------------------------------------------------------ CLI */
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.mp4': 'video/mp4' };
function expand(v) {
  if (typeof v === 'string') {
    if (v.startsWith('@file:')) {
      const f = v.slice(6);
      return `data:${MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(f).toString('base64')}`;
    }
    if (v.startsWith('@b64:')) return fs.readFileSync(v.slice(5)).toString('base64');
    return v;
  }
  if (Array.isArray(v)) return v.map(expand);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)]));
  return v;
}

async function cli(argv) {
  const [studio, raw, ...rest] = argv;
  if (!studio || !raw) {
    console.error('usage: node studio.mjs <flux|audio|hunyuan> <json body | @body.json> [--out dir] [--pick N] [--timeout minutes]');
    process.exit(2);
  }
  const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
  const outDir = path.resolve(opt('out', '.'));
  const body = expand(JSON.parse(raw.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw));
  const t0 = Date.now();
  const stamp = () => `[${Math.round((Date.now() - t0) / 1000)}s]`;
  const job = await submit(studio, body);
  console.log(`${stamp()} submitted ${studio} job ${job.id}`);
  const done = await wait(studio, job.id, {
    onLog: (l) => console.log(`${stamp()} ${l}`),
    timeoutMs: Number(opt('timeout', 30)) * 60e3,
    autoPick: opt('pick') != null ? Number(opt('pick')) : (studio === 'hunyuan' && body.mode === 'text' ? 0 : undefined),
  });
  if (!isTerminal(studio, done) || FAILED.includes(done.status)) {
    console.error(`${stamp()} ${done.status}: ${done.error || ''}`);
    process.exit(1);
  }
  if (done.log?.length) console.log(done.log.slice(-4).join('\n'));
  const files = await listFiles(studio, job.id, done);
  for (const f of files) console.log(`${stamp()} saved ${await download(studio, job.id, f, path.join(outDir, `${job.id}-${f}`))}`);
  console.log(`${stamp()} done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
