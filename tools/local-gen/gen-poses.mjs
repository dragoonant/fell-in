// M5 two-handed pose figures: crop concept -> Flux klein edit (empty-fist stance) -> Hunyuan Studio image-to-3D -> bpy finalize
// -> measure grip/support fists -> optimise -> manifest "poses" entry. Batch: tools/local-gen/pose-batch.json.
//   node tools/local-gen/gen-poses.mjs <crop|flux|choose|model|finalize|render|skin|snap|info|ship> [--only unit@cls,...] [--reword] [--n N]
//   choose: node gen-poses.mjs choose unit@cls=<attempt>   (the Flux attempt number whose image goes to Hunyuan)
// Work files live outside the repo (POSES_WORK or the OS temp dir). Needs the Hunyuan3D-2.1 venv (bpy, trimesh) under the home folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { submit, wait, listFiles, download } from './studio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = process.env.POSES_WORK || path.join(os.tmpdir(), 'fellin-m5-poses');
const HOME = os.homedir();
const PY = path.join(HOME, 'Hunyuan3D-2.1', '.venv', 'Scripts', 'python.exe');
const FINALIZE_PY = path.join(HOME, 'Hunyuan3D-2', 'finalize_model.py');
const batch = JSON.parse(fs.readFileSync(path.join(HERE, 'pose-batch.json'), 'utf8'));
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const key = (p) => `${p.unit}@${p.cls}`;
const only = opt('only')?.split(',');
const pairs = batch.pairs.filter((p) => !only || only.includes(key(p)));
const statePath = path.join(WORK, 'state.json');
fs.mkdirSync(WORK, { recursive: true });
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const st = (p) => (state[key(p)] ||= { attempts: 0, hseed: 1234, reword: false });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wp = (...a) => path.join(WORK, ...a);

// 1. crop each concept to a 3:4 portrait around the figure (the edit output copies the reference's shape)
async function crop() {
  fs.mkdirSync(wp('ref'), { recursive: true });
  for (const p of pairs) {
    const src = p.src.startsWith('~/') ? path.join(HOME, p.src.slice(2)) : path.join(ROOT, p.src);
    const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 215) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const figH = y1 - y0 + 1, figW = x1 - x0 + 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // a 3:4 window that holds the figure with a margin; parts outside the source stay white
    const H = Math.round(Math.max(figH * 1.12, (figW * 1.18) * 4 / 3)), W = Math.round(H * 3 / 4);
    const left = Math.round(cx - W / 2), top = Math.round(cy - H / 2);
    const sx = Math.max(0, left), sy = Math.max(0, top);
    const ex = { left: sx, top: sy, width: Math.min(info.width - sx, W - (sx - left)), height: Math.min(info.height - sy, H - (sy - top)) };
    const piece = await sharp(src).removeAlpha().extract(ex).png().toBuffer();
    const win = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite([{ input: piece, left: sx - left, top: sy - top }]).resize(768, 1024).png().toBuffer();
    fs.writeFileSync(wp('ref', `${p.unit}.png`), win);
    log('crop', p.unit, `fig ${figW}x${figH} -> window ${W}x${H}`);
  }
}

async function montage(files, out, cols) {
  const tiles = files.filter((f) => fs.existsSync(f));
  const w = 384, h = 512, rows = Math.ceil(tiles.length / cols);
  const comps = [];
  for (let i = 0; i < tiles.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    comps.push({ input: await sharp(tiles[i]).resize(w, h, { fit: 'contain', background: '#fff' }).png().toBuffer(), left: col * w, top: row * (h + 20) + 20 });
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20"><text x="4" y="14" font-size="13" font-family="Arial">${path.basename(tiles[i])}</text></svg>`), left: col * w, top: row * (h + 20) });
  }
  await sharp({ create: { width: w * cols, height: rows * (h + 20), channels: 3, background: '#fff' } }).composite(comps).png().toFile(out);
  log('sheet', out);
}

// 2. Flux klein edit: one attempt per pair per run, all submitted at once (Flux serialises its own GPU queue)
async function flux() {
  fs.mkdirSync(wp('flux'), { recursive: true });
  const made = [];
  const per = Number(opt('n') || 1);
  const jobs = pairs.flatMap((p) => Array.from({ length: per }, () => p));
  await Promise.all(jobs.map(async (p) => {
    const s = st(p);
    if (flag('reword')) s.reword = true;
    if (opt('stance')) s.override = batch.variants[opt('stance')];
    if (flag('default-stance')) delete s.override;
    const stance = s.override || (s.reword ? batch.reword : batch.stances)[p.cls];
    const prompt = `The character shown, ${stance}; ${batch.common}.`;
    const n = ++s.attempts;
    const seed = 4000 + n * 131 + [...key(p)].reduce((a, c) => a + c.charCodeAt(0), 0);
    const ref = `data:image/png;base64,${fs.readFileSync(wp('ref', `${p.unit}.png`)).toString('base64')}`;
    const job = await submit('flux', { model: 'klein', mode: 'edit', prompt, images: [ref], megapixels: 1, seed, batch: 1 });
    const done = await wait('flux', job.id, { timeoutMs: 40 * 60e3 });
    if (done.status !== 'done') { log('FAILED', key(p), done.status, done.error || ''); return; }
    const [f] = await listFiles('flux', job.id, done);
    const dest = wp('flux', `${key(p)}.${n}.png`);
    await download('flux', job.id, f, dest);
    made.push(dest);
    log('flux', key(p), `attempt ${n} seed ${seed}${s.reword ? ' (reworded)' : ''}`);
  }));
  save();
  made.sort();
  await montage(made, wp('flux-sheet.png'), 4);
}

function choose() {
  for (const a of args.slice(1)) {
    const [k, n] = a.split('=');
    const p = batch.pairs.find((x) => key(x) === k);
    if (!p || !n) throw new Error(`bad choose arg ${a}`);
    st(p).pick = Number(n);
    log('chose', k, n);
  }
}

// 3. Hunyuan Studio image-to-3D, ONE job at a time (the studio does not queue)
async function model() {
  fs.mkdirSync(wp('raw'), { recursive: true });
  const failed = [];
  for (const p of pairs) {
    const s = st(p);
    const dest = wp('raw', `${key(p)}.glb`);
    if (!flag('force') && fs.existsSync(dest)) continue;
    if (!s.pick) { log('skip (no chosen image)', key(p)); continue; }
    const image = fs.readFileSync(wp('flux', `${key(p)}.${s.pick}.png`)).toString('base64');
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      const job = await submit('hunyuan', {
        mode: 'image', image, name: `pose-${p.unit}-${p.cls}`,
        params: { texture: true, removeBg: true, cutBase: true, seed: s.hseed, steps: 50, octree: 384, faceCount: 12000, texRes: 1024 },
      });
      log('submitted', key(p), job.id, `attempt ${attempt}`);
      const done = await wait('hunyuan', job.id, { timeoutMs: 90 * 60e3, intervalMs: 3000 });
      if (done.status === 'completed') {
        await download('hunyuan', job.id, done.model, dest);
        log('model', key(p), done.model, (done.log || []).filter((l) => /base/i.test(l)).join(' | ')); ok = true;
      } else log('FAILED', key(p), String(done.error || done.status).slice(0, 120));
    }
    if (!ok) failed.push(key(p));
    save();
  }
  if (failed.length) log('gave up on', failed.join(','));
}

// 4. finalize like the default figure of the same unit: height in inches, base size, black base disc
function finalize() {
  fs.mkdirSync(wp('final'), { recursive: true });
  for (const p of pairs) {
    const src = wp('raw', `${key(p)}.glb`);
    if (!fs.existsSync(src)) { log('skip (no raw)', key(p)); continue; }
    const r = spawnSync(PY, ['-I', FINALIZE_PY, src, wp('final', `${key(p)}.glb`), '--height', String(p.height), '--base', String(p.base)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    log(key(p), r.stdout.trim().split('\n').pop() || r.stderr.slice(-300));
  }
}

// 5. measure: the fitted-frame views (front, side, top) with a 0.25 in grid, the skin-coloured clusters, and a snap to a fist centre.
//    The numbers go into pose-batch.json (yaw, hand = the rear/grip fist, support = the forward/upper fist).
function measure(mode) {
  const f = wp('measure.py');
  fs.writeFileSync(f, PY_MEASURE);
  for (const p of pairs) {
    const glb = wp('final', `${key(p)}.glb`);
    if (!fs.existsSync(glb)) { log('skip (no final)', key(p)); continue; }
    const extra = [];
    if (p.yaw != null && !opt('yaw')) extra.push('--yaw', String(p.yaw));
    if (p.fitHeight && !opt('height')) extra.push('--height', String(p.fitHeight));
    for (const k of ['yaw', 'height', 'r']) if (opt(k)) extra.push(`--${k}`, opt(k));
    if (flag('zoom')) extra.push('--zoom');
    if (opt('maxpitch')) extra.push('--maxpitch', opt('maxpitch'));
    if (flag('keepyaw')) extra.push('--keepyaw');
    if (opt('band')) extra.push('--band', opt('band'));
    if (mode === 'render') {
      fs.mkdirSync(wp('views'), { recursive: true });
      extra.push('--out', wp('views', `${key(p)}.png`), '--title', key(p));
      const marks = [p.hand, p.support].filter(Boolean).map((v) => v.join(','));
      if (marks.length) extra.push(`--marks=${marks.join(';')}`);
    }
    if (opt('r')) {}
    if (opt('pts')) extra.push(`--pts=${opt('pts')}`);
    const r = spawnSync(PY, ['-I', f, mode, glb, '--base', String(p.gameBase ?? p.base), ...extra], { encoding: 'utf8', maxBuffer: 1 << 26 });
    console.log(key(p), r.stdout.trim() || r.stderr.slice(-400));
  }
}

// 6. ship: optimise the finalized GLBs with the repo tool, copy them next to the default figures, write the manifest "poses" entries
function ship() {
  const stage = wp('ship');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const ready = pairs.filter((p) => p.hand && p.support && fs.existsSync(wp('final', `${key(p)}.glb`)));
  for (const p of ready) fs.copyFileSync(wp('final', `${key(p)}.glb`), path.join(stage, `${key(p)}.glb`));
  const mainRoot = path.resolve(ROOT, '..', '..', '..');
  const toolRoot = fs.existsSync(path.join(ROOT, 'node_modules', 'sharp')) ? ROOT : mainRoot;
  const r = spawnSync(process.execPath, [path.join(toolRoot, 'tools', 'models', 'optimize.mjs'), '--dir', stage, '--size', '1024'], { cwd: toolRoot, encoding: 'utf8' });
  console.log((r.stdout || '').slice(-500), (r.stderr || '').slice(-300));
  const mpath = path.join(ROOT, 'public', 'assets', 'models', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(mpath, 'utf8'));
  for (const p of ready) {
    const out = path.join(ROOT, 'public', 'assets', 'models', 'units', `${key(p)}.glb`);
    fs.copyFileSync(path.join(stage, `${key(p)}.glb`), out);
    const unit = manifest.units[p.unit];
    if (!unit) { log('NOT in manifest', p.unit); continue; }
    unit.poses ||= {};
    unit.poses[p.cls] = { file: `units/${key(p)}.glb`, hand: p.hand, support: p.support, yaw: p.yaw, ...(p.fitHeight ? { height: p.fitHeight } : {}) };
    log('shipped', key(p), `${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
  }
  fs.writeFileSync(mpath, JSON.stringify(manifest, null, 2) + '\n');
}

const handlers = { crop, flux, choose, model, finalize, render: () => measure('render'), skin: () => measure('skin'), tips: () => measure('tips'), snap: () => measure('snap'), solve: () => measure('solve'), info: () => measure('info'), ship };

const PY_MEASURE = String.raw`import argparse, json, math, sys
import numpy as np, trimesh
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ap = argparse.ArgumentParser()
ap.add_argument('mode', choices=['render', 'snap', 'info', 'skin', 'solve', 'tips'])
ap.add_argument('glb')
ap.add_argument('--yaw', type=float, default=0.0)
ap.add_argument('--base', type=float, default=32)
ap.add_argument('--height', type=float, default=0.0)
ap.add_argument('--out', default='view.png')
ap.add_argument('--pts', default='')
ap.add_argument('--r', type=float, default=0.18)
ap.add_argument('--marks', default='')
ap.add_argument('--title', default='')
ap.add_argument('--zoom', action='store_true')
ap.add_argument('--band', default='')
ap.add_argument('--keepyaw', action='store_true')
ap.add_argument('--maxpitch', type=float, default=90.0)
a = ap.parse_args()
a.pts = [t for t in a.pts.split(';') if t]
a.marks = [t for t in a.marks.split(';') if t]

scene = trimesh.load(a.glb, force='mesh')
V = np.asarray(scene.vertices, dtype=float)

def fitted(P):
    """GLB frame -> fitted figure frame exactly like the client (yaw about +y, bbox fit to figure height, centre on base, +0.12)."""
    c, s = math.cos(a.yaw), math.sin(a.yaw)
    x = P[:, 0] * c + P[:, 2] * s
    z = -P[:, 0] * s + P[:, 2] * c
    return np.stack([x, P[:, 1], z], axis=1)

R = fitted(V)
lo, hi = R.min(axis=0), R.max(axis=0)
H = a.height or (1.45 + (a.base - 25) * 0.045)
sc = H / (hi[1] - lo[1])
off = np.array([-(lo[0] + hi[0]) / 2 * sc, -lo[1] * sc + 0.12, -(lo[2] + hi[2]) / 2 * sc])
F = R * sc + off

if a.mode == 'info':
    print(json.dumps({'raw_bbox': [lo.tolist(), hi.tolist()], 'scale': sc, 'fitted_bbox': [F.min(axis=0).round(3).tolist(), F.max(axis=0).round(3).tolist()]}))
    sys.exit(0)

def snap_pt(q):
    q = np.array(q, dtype=float)
    for _ in range(3):
        m = np.linalg.norm(F - q, axis=1) < a.r
        if m.sum() == 0: break
        q = F[m].mean(axis=0)
    return q

if a.mode == 'solve':
    # --pts hand support (fitted frame at --yaw): snap both fists, derive the yaw that points hand->support along +z, print final numbers
    q0 = [snap_pt([float(t) for t in p.split(',')]) for p in a.pts[:2]]
    # back to the raw (unfitted, unrotated) GLB frame
    raw = []
    for q in q0:
        r_ = (q - off) / sc
        c, s_ = math.cos(a.yaw), math.sin(a.yaw)
        raw.append(np.array([r_[0] * c - r_[2] * s_, r_[1], r_[0] * s_ + r_[2] * c]))
    best = None
    d0 = q0[1] - q0[0]
    phi = 0.0 if a.keepyaw else math.atan2(-d0[0], d0[2])
    yaw2 = a.yaw + phi
    c, s_ = math.cos(yaw2), math.sin(yaw2)
    def fit2(P):
        x = P[:, 0] * c + P[:, 2] * s_; z = -P[:, 0] * s_ + P[:, 2] * c
        return np.stack([x, P[:, 1], z], axis=1)
    R2 = fit2(V); lo2, hi2 = R2.min(axis=0), R2.max(axis=0)
    sc2 = H / (hi2[1] - lo2[1]); off2 = np.array([-(lo2[0] + hi2[0]) / 2 * sc2, -lo2[1] * sc2 + 0.12, -(lo2[2] + hi2[2]) / 2 * sc2])
    out = [(fit2(np.array([r_])) * sc2 + off2)[0] for r_ in raw]
    h, sp = out
    d = sp - h
    hz = math.hypot(d[0], d[2])
    pit = math.degrees(math.atan2(d[1], hz))
    if abs(pit) > a.maxpitch:
        # keep the grip fist, tilt the axis to the limit and slide the support point along it (the support fist then sits beside the axis)
        pit = math.copysign(a.maxpitch, pit)
        L = float(np.linalg.norm(d))
        d = np.array([d[0] / hz * math.cos(math.radians(pit)) * L, math.sin(math.radians(pit)) * L, d[2] / hz * math.cos(math.radians(pit)) * L])
        sp = h + d
    # face heading: skin-coloured points of the head relative to the head centre, in the final frame (0 deg = +z, positive = toward +x)
    face = None
    try:
        pts_, fi_ = trimesh.sample.sample_surface(scene, 60000)
        pts_ = np.asarray(pts_)
        tri_ = scene.triangles[fi_]; bary_ = trimesh.triangles.points_to_barycentric(tri_, pts_)
        puv_ = (scene.visual.uv[scene.faces[fi_]] * bary_[:, :, None]).sum(axis=1)
        img_ = np.asarray(scene.visual.material.baseColorTexture.convert('RGB')); Wd, Hd = img_.shape[1], img_.shape[0]
        col_ = img_[np.clip(((1 - puv_[:, 1]) * (Hd - 1)).astype(int), 0, Hd - 1), np.clip((puv_[:, 0] * (Wd - 1)).astype(int), 0, Wd - 1)] / 255.0
        Q = fit2(pts_) * sc2 + off2
        top = Q[:, 1].max()
        head = (Q[:, 1] > top - 0.28)
        sk = head & (col_[:, 0] > col_[:, 1] + 0.05) & (col_[:, 0] - col_[:, 2] > 0.12) & (col_[:, 0] > 0.45)
        if sk.sum() > 40 and head.sum() > 100:
            v = Q[sk][:, [0, 2]].mean(axis=0) - Q[head][:, [0, 2]].mean(axis=0)
            face = round(math.degrees(math.atan2(v[0], v[1])), 1)
    except Exception as e:
        face = None
    # torso facing: the hips are wider than deep, so the facing axis is perpendicular to the principal axis of a waist-height slab
    torso_off = None
    try:
        Fv = fit2(V) * sc2 + off2
        ytop = Fv[:, 1].max(); ybot = 0.3 + 0.0
        wl, wh = ybot + 0.52 * (ytop - ybot), ybot + 0.62 * (ytop - ybot)
        W = Fv[(Fv[:, 1] > wl) & (Fv[:, 1] < wh)][:, [0, 2]]
        W = W - W.mean(axis=0)
        ev, evec = np.linalg.eigh(np.cov(W.T))
        major = evec[:, 1]
        facing = np.array([-major[1], major[0]])
        ang = math.degrees(math.atan2(facing[0], facing[1]))
        ang = (ang + 90) % 180 - 90   # facing line angle off +z, folded to -90..90
        torso_off = round(ang, 1)
    except Exception as e:
        torso_off = None
    print(json.dumps({'torso_axis_off_aim_deg': torso_off, 'face_heading_deg': face, 'yaw': round(yaw2, 3), 'hand': [round(float(t), 3) for t in h], 'support': [round(float(t), 3) for t in sp],
                      'sep': round(float(np.linalg.norm(d)), 3), 'pitch_deg': round(math.degrees(math.atan2(d[1], math.hypot(d[0], d[2]))), 1), 'heading_err_deg': round(math.degrees(math.atan2(d[0], d[2])), 1)}))
    sys.exit(0)

if a.mode == 'snap':
    out = []
    for p in a.pts:
        q = np.array([float(t) for t in p.split(',')])
        # fist centre: mean of the vertices inside the ball, then once more around that mean
        for _ in range(3):
            m = np.linalg.norm(F - q, axis=1) < a.r
            if m.sum() == 0: break
            q = F[m].mean(axis=0)
        out.append([round(float(t), 3) for t in q] + [int(m.sum())])
    print(json.dumps(out))
    sys.exit(0)

# render: front / side / top point clouds with a 0.25 in grid
pts, fi = trimesh.sample.sample_surface(scene, 90000)
pts = np.asarray(pts)
try:
    tri = scene.triangles[fi]
    bary = trimesh.triangles.points_to_barycentric(tri, pts)
    uv = scene.visual.uv[scene.faces[fi]]
    puv = (uv * bary[:, :, None]).sum(axis=1)
    img = scene.visual.material.baseColorTexture.convert('RGB')
    W, Hh = img.size
    arr = np.asarray(img)
    px = np.clip((puv[:, 0] * (W - 1)).astype(int), 0, W - 1)
    py = np.clip(((1 - puv[:, 1]) * (Hh - 1)).astype(int), 0, Hh - 1)
    C = arr[py, px] / 255.0
except Exception as e:
    print('no colours', e)
    C = np.full((len(pts), 3), 0.5)
P = fitted(pts) * sc + off
body = P[:, 1] > 0.16
if a.mode == 'tips':
    # arm-end candidates for figures without skin-coloured hands: points far from the torso axis (or far above the shoulders), clustered
    Wd = P[(P[:, 1] > 0.3 + 0.35 * (P[:, 1].max() - 0.3)) & (P[:, 1] < 0.3 + 0.5 * (P[:, 1].max() - 0.3))]
    axis = np.median(Wd[:, [0, 2]], axis=0)
    rr = np.hypot(P[:, 0] - axis[0], P[:, 2] - axis[1])
    sel = (P[:, 1] > 0.8 + 0.0) & ((rr > a.r) | (P[:, 1] > P[:, 1].max() - 0.0))
    Q = P[(P[:, 1] > 0.9) & (rr > a.r)]
    # cluster greedily from the farthest point outward
    order_ = np.argsort(-np.hypot(Q[:, 0] - axis[0], Q[:, 2] - axis[1]))
    cl = []
    for i in order_:
        q = Q[i]
        for c in cl:
            if np.linalg.norm(c['p'] - q) < 0.28:
                c['n'] += 1; c['s'] += q; c['p'] = c['s'] / c['n']; break
        else:
            cl.append({'n': 1, 's': q.copy(), 'p': q.copy()})
    cl = [c for c in cl if c['n'] > 30]
    cl.sort(key=lambda c: -np.hypot(c['p'][0] - axis[0], c['p'][2] - axis[1]))
    print('axis', np.round(axis, 3).tolist())
    for c in cl[:8]: print(c['n'], np.round(c['p'], 3).tolist())
    sys.exit(0)

if a.mode == 'skin':
    # skin-coloured surface clusters (hands, face, neck) in the fitted frame, biggest first
    r, g, b = C[:, 0], C[:, 1], C[:, 2]
    m = (r > g + 0.06) & (g > b - 0.02) & (r - b > 0.15) & (r > 0.5) & body
    Q = P[m]
    cl = []
    for q in Q:
        for c in cl:
            if np.linalg.norm(c['p'] - q) < 0.17:
                c['n'] += 1; c['s'] += q; c['p'] = c['s'] / c['n']; break
        else:
            cl.append({'n': 1, 's': q.copy(), 'p': q.copy()})
    cl = [c for c in cl if c['n'] > 25]
    cl.sort(key=lambda c: -c['n'])
    for c in cl: print(c['n'], np.round(c['p'], 3).tolist())
    sys.exit(0)
P, C = P[body], C[body]
fig, axs = plt.subplots(1, 3, figsize=(21, 8.2), dpi=80)
views = [('front (from +z)  x ->', 0, 1, 1), ('side (aim +z ->)', 2, 1, 1), ('top (x ->, +z down)', 0, 2, -1)]
marks = [[float(t) for t in m.split(',')] for m in a.marks]
for ax, (name, ix, iy, sgn) in zip(axs, views):
    order = np.argsort(P[:, 2 if ix == 0 else 0])
    if ix == 0 and iy == 1: order = np.argsort(P[:, 2])           # front: far (low z) first, near last
    elif ix == 2: order = np.argsort(-P[:, 0])                     # side seen from +x: far (low x) first
    else: order = np.argsort(P[:, 1])                              # top: low first
    if iy == 2 and a.band:
        b0, b1 = [float(t) for t in a.band.split(',')]
        order = order[(P[order, 1] >= b0) & (P[order, 1] <= b1)]
    ax.scatter(P[order, ix], sgn * P[order, iy] if iy == 2 else P[order, iy], s=2.2, c=C[order], linewidths=0)
    ax.set_aspect('equal'); ax.set_title(name + '   ' + a.title)
    ax.set_xticks(np.arange(-1.5, 1.51, 0.25)); ax.tick_params(labelsize=7)
    if iy == 2:
        ax.set_yticks(-np.arange(-1.5, 1.51, 0.25)); ax.set_yticklabels([f'{t:.2f}' for t in np.arange(-1.5, 1.51, 0.25)])
    else:
        ax.set_yticks(np.arange(0, 3.01, 0.25))
    ax.grid(True, color='#888', linewidth=0.4, alpha=0.7)
    for m in marks:
        ax.plot(m[ix], (-m[iy] if iy == 2 else m[iy]), 'r+', ms=14, mew=2)
    if iy == 1: ax.set_xlim(-1.3, 1.3); ax.set_ylim(0, F[:, 1].max() + 0.2)
    else: ax.set_xlim(-1.3, 1.3); ax.set_ylim(-1.3, 1.3)
    if a.zoom:
        if iy == 1:
            ax.set_xlim(-0.7, 0.7); ax.set_ylim(0.9, min(2.5, F[:, 1].max() + 0.05))
            ax.set_xticks(np.arange(-0.7, 0.71, 0.1)); ax.set_yticks(np.arange(0.9, min(2.5, F[:, 1].max() + 0.05) + 0.01, 0.1))
        else:
            ax.set_xlim(-0.7, 0.7); ax.set_ylim(-0.7, 0.7)
            ax.set_xticks(np.arange(-0.7, 0.71, 0.1)); ax.set_yticks(-np.arange(-0.7, 0.71, 0.1)); ax.set_yticklabels([f'{t:.1f}' for t in np.arange(-0.7, 0.71, 0.1)])
plt.tight_layout()
plt.savefig(a.out)
print('wrote', a.out)
`;

if (!handlers[cmd]) { console.error('usage: gen-poses.mjs <crop|flux|choose|model|finalize|render|skin|snap|info|ship> [--only unit@cls] [--reword] [--n N] [--yaw r] [--pts "x,y,z;x,y,z"]'); process.exit(2); }
await handlers[cmd]();
save();
