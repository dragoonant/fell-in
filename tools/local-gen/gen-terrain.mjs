// M5 terrain batch: Flux concept -> Hunyuan image-to-3D -> bpy finalize -> optimize -> manifest -> contact sheet.
//   node tools/local-gen/gen-terrain.mjs <concept|model|finalize|sheet|ship> [--only a,b] [--reseed]
// Work files live outside the repo (TERRAIN_WORK or the OS temp dir). Needs the Hunyuan3D-2.1 venv (bpy, PIL) under the
// home folder; paths come from os.homedir(). Batch definition: tools/local-gen/terrain-batch.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { submit, wait, listFiles, download } from './studio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = process.env.TERRAIN_WORK || path.join(os.tmpdir(), 'fellin-m5-terrain');
const PY = path.join(os.homedir(), 'Hunyuan3D-2.1', '.venv', 'Scripts', 'python.exe');
const TERRAIN_DIR = path.join(ROOT, 'public', 'assets', 'models', 'terrain');
const SHEET_DIR = path.join(ROOT, 'art', 'terrain-sheets');
const batch = JSON.parse(fs.readFileSync(path.join(HERE, 'terrain-batch.json'), 'utf8'));
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('only')?.split(',');
const pieces = batch.pieces.filter((p) => !only || only.includes(p.slug));
const statePath = path.join(WORK, 'state.json');
fs.mkdirSync(WORK, { recursive: true });
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const st = (slug) => (state[slug] ||= { cseed: 1000 + batch.pieces.findIndex((p) => p.slug === slug) * 17, hseed: 1234 });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function inChunks(items, n, fn) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn));
}

async function concept() {
  fs.mkdirSync(path.join(WORK, 'concepts'), { recursive: true });
  await inChunks(pieces, 8, async (p) => {
    const s = st(p.slug);
    if (flag('reseed')) s.cseed += 7919;
    const prompt = batch.promptTemplate.replace('{desc}', p.desc);
    const job = await submit('flux', { model: 'klein', mode: 't2i', prompt, aspect: '1:1', seed: s.cseed, batch: 1 });
    const done = await wait('flux', job.id, { timeoutMs: 40 * 60e3 });
    if (done.status !== 'done') throw new Error(`${p.slug} flux ${done.status} ${done.error || ''}`);
    const [f] = await listFiles('flux', job.id, done);
    await download('flux', job.id, f, path.join(WORK, 'concepts', `${p.slug}.png`));
    log('concept', p.slug, 'seed', s.cseed);
  });
  save();
  run('montage', [path.join(WORK, 'concepts'), path.join(WORK, 'concepts-sheet.png'), ...pieces.map((p) => p.slug)]);
}

async function model() {
  fs.mkdirSync(path.join(WORK, 'raw'), { recursive: true });
  const queue = pieces.filter((p) => flag('force') || !fs.existsSync(path.join(WORK, 'raw', `${p.slug}.glb`)));
  const failed = [];
  // The studio serialises GPU work, but a failed job (out of memory while another session holds the GPU) is retried.
  const one = async (p) => {
    const s = st(p.slug);
    if (flag('reseed')) s.hseed += 31;
    const image = fs.readFileSync(path.join(WORK, 'concepts', `${p.slug}.png`)).toString('base64');
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await submit('hunyuan', {
        mode: 'image', image, name: p.slug,
        params: { texture: true, removeBg: true, cutBase: true, seed: s.hseed, steps: 50, octree: 384, faceCount: 15000, texRes: 1024 },
      });
      log('submitted', p.slug, job.id, `attempt ${attempt}`);
      const done = await wait('hunyuan', job.id, { timeoutMs: 90 * 60e3, intervalMs: 3000 });
      if (done.status === 'completed') {
        await download('hunyuan', job.id, done.model, path.join(WORK, 'raw', `${p.slug}.glb`));
        log('model', p.slug, done.model);
        return;
      }
      log('FAILED', p.slug, String(done.error || done.status).slice(0, 120));
    }
    failed.push(p.slug);
  };
  const width = Number(opt('parallel') || 2);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < queue.length) await one(queue[next++]);
  }));
  save();
  if (failed.length) log('gave up on', failed.join(','));
}

function run(script, a) {
  const f = path.join(WORK, `${script}.py`);
  fs.writeFileSync(f, PYTHON[script]);
  const r = spawnSync(PY, ['-I', f, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) console.error(r.stderr.slice(-1500));
  return r.stdout;
}

function finalize() {
  fs.mkdirSync(path.join(WORK, 'final'), { recursive: true });
  for (const p of pieces) {
    const src = path.join(WORK, 'raw', `${p.slug}.glb`);
    if (!fs.existsSync(src)) { log('skip (no raw)', p.slug); continue; }
    const out = run('finalize', [src, path.join(WORK, 'final', `${p.slug}.glb`), ...p.size.map(String), ...(p.largest ? ['--largest'] : [])]);
    log(p.slug, out.split('\n').find((l) => l.startsWith('RESULT')) || 'FAILED');
  }
}

function sheet() {
  const all = batch.pieces.map((p) => p.slug).filter((s) => fs.existsSync(path.join(WORK, 'final', `${s}.glb`)));
  const slugs = only ? all.filter((s) => only.includes(s)) : all;
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  run('render', [path.join(WORK, 'final'), path.join(WORK, 'views'), ...slugs]);
  run('montage', [path.join(WORK, 'views'), path.join(SHEET_DIR, 'm5-terrain.png'), ...all, '--cols', '3']);
  log('sheet', path.join(SHEET_DIR, 'm5-terrain.png'));
}

function ship() {
  // optimise a staging copy with the repo's tool (taken from the main checkout when this worktree has no node_modules)
  const stage = path.join(WORK, 'ship');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const slugs = pieces.map((p) => p.slug).filter((s) => fs.existsSync(path.join(WORK, 'final', `${s}.glb`)));
  for (const s of slugs) fs.copyFileSync(path.join(WORK, 'final', `${s}.glb`), path.join(stage, `${s}.glb`));
  const mainRoot = path.resolve(ROOT, '..', '..', '..');
  const toolRoot = fs.existsSync(path.join(ROOT, 'node_modules', 'sharp')) ? ROOT : mainRoot;
  const r = spawnSync(process.execPath, [path.join(toolRoot, 'tools', 'models', 'optimize.mjs'), '--dir', stage, '--size', '1024'], { encoding: 'utf8' });
  console.log(r.stdout.slice(-600), r.stderr.slice(-600));
  const mpath = path.join(TERRAIN_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(mpath, 'utf8'));
  for (const p of pieces) {
    if (!slugs.includes(p.slug)) continue;
    fs.copyFileSync(path.join(stage, `${p.slug}.glb`), path.join(TERRAIN_DIR, `${p.slug}.glb`));
    manifest[p.slug] = { file: `${p.slug}.glb`, size: p.size, rulesType: p.rulesType };
  }
  fs.writeFileSync(mpath, JSON.stringify(manifest, null, 2) + '\n');
  const cpath = path.join(TERRAIN_DIR, 'CREDITS.md');
  let credits = fs.readFileSync(cpath, 'utf8');
  for (const p of pieces) {
    if (!slugs.includes(p.slug) || credits.includes(`\`${p.slug}\``)) continue;
    credits += `\n- \`${p.slug}\` (${p.theme}): generated locally with FLUX.2 klein and Hunyuan3D 2.1, original prompt.`;
  }
  fs.writeFileSync(cpath, credits.replace(/\n*$/, '\n'));
  log('shipped', slugs.length);
}

const PYTHON = {
  finalize: String.raw`import argparse, math, os
import bpy, numpy as np
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('w', type=float); ap.add_argument('d', type=float); ap.add_argument('h', type=float)
ap.add_argument('--largest', action='store_true'); ap.add_argument('--tris', type=int, default=6000)
a = ap.parse_args()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.src))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o != obj: bpy.data.objects.remove(o)
def sel(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
if a.largest:
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    obj = max(parts, key=lambda o: len(o.data.vertices))
    for o in parts:
        if o != obj: bpy.data.objects.remove(o)
    sel(obj)
sel(obj)
tm = obj.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier=tm.name)
n0 = len(obj.data.polygons)
if n0 > a.tris:
    dm = obj.modifiers.new('dec', 'DECIMATE'); dm.ratio = a.tris / n0; dm.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dm.name)
def getv():
    n = len(obj.data.vertices); buf = np.zeros(n * 3); obj.data.vertices.foreach_get('co', buf); return buf.reshape(n, 3)
def setv(v):
    obj.data.vertices.foreach_set('co', v.reshape(-1)); obj.data.update()
v = getv(); best = (None, 0.0)
for deg in np.arange(0, 90, 0.5):
    r = math.radians(deg); x = v[:, 0] * math.cos(r) - v[:, 1] * math.sin(r); y = v[:, 0] * math.sin(r) + v[:, 1] * math.cos(r)
    area = (x.max() - x.min()) * (y.max() - y.min())
    if best[0] is None or area < best[0]: best = (area, deg)
r = math.radians(best[1]); v = np.stack([v[:, 0] * math.cos(r) - v[:, 1] * math.sin(r), v[:, 0] * math.sin(r) + v[:, 1] * math.cos(r), v[:, 2]], axis=1)
if np.ptp(v[:, 1]) > np.ptp(v[:, 0]):
    v = np.stack([-v[:, 1], v[:, 0], v[:, 2]], axis=1)
lo, hi = v.min(axis=0), v.max(axis=0); e = hi - lo
sx = a.w / e[0]
sy = min(max(a.d / e[1], 0.45 * sx), 2.2 * sx)
sz = min(max(a.h / e[2], 0.45 * sx), 2.2 * sx)
v = (v - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])) * np.array([sx, sy, sz])
setv(v)
for m in obj.data.materials:
    if m and m.use_nodes:
        p = m.node_tree.nodes.get('Principled BSDF')
        if p:
            for name, value in (('Metallic', 0.0), ('Roughness', 0.85)):
                s = p.inputs[name]
                for l in list(s.links): m.node_tree.links.remove(l)
                s.default_value = value
for img in bpy.data.images:
    if img.size[0] > 1024 or img.size[1] > 1024: img.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.dst), export_format='GLB', export_image_format='JPEG', export_yup=True)
d = np.ptp(v, axis=0)
print(f'RESULT size={d[0]:.2f}x{d[1]:.2f}x{d[2]:.2f} target={a.w}x{a.d}x{a.h} tris={len(obj.data.polygons)} raw={e[0]:.2f}x{e[1]:.2f}x{e[2]:.2f} distort_y={sy/sx:.2f} distort_z={sz/sx:.2f}')
`,
  render: String.raw`import math, os, sys
import bpy
from mathutils import Vector
src, out, *slugs = sys.argv[1:]
os.makedirs(out, exist_ok=True)
for slug in slugs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, slug + '.glb'))
    ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2; size = max(hi - lo)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.device = 'CPU'
    sc.render.resolution_x = sc.render.resolution_y = 384
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.85, 0.85, 1); sc.world = w
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
    tg = bpy.data.objects.new('t', None); tg.location = c; sc.collection.objects.link(tg)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.5
    tr = cam.constraints.new('TRACK_TO'); tr.target = tg; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
    for name, az in (('a', -35), ('b', 145)):
        r = math.radians(az)
        cam.location = c + Vector((math.sin(r), -math.cos(r), 0.75)).normalized() * size * 3
        sc.render.filepath = os.path.join(out, slug + '_' + name + '.png'); bpy.ops.render.render(write_still=True)
    print('rendered', slug, flush=True)
`,
  montage: String.raw`import os, sys
from PIL import Image, ImageDraw
d, out, *rest = sys.argv[1:]
cols = 4
if '--cols' in rest:
    i = rest.index('--cols'); cols = int(rest[i + 1]); rest = rest[:i] + rest[i + 2:]
tiles = []
for s in rest:
    ims = [Image.open(os.path.join(d, s + suf + '.png')).convert('RGB').resize((384, 384)) for suf in ('_a', '_b') if os.path.exists(os.path.join(d, s + suf + '.png'))]
    if not ims: ims = [Image.open(os.path.join(d, s + '.png')).convert('RGB').resize((384, 384))]
    t = Image.new('RGB', (384 * len(ims), 404), 'white')
    for k, im in enumerate(ims): t.paste(im, (384 * k, 20))
    ImageDraw.Draw(t).text((4, 4), s, fill='black')
    tiles.append(t)
tw = max(t.width for t in tiles); rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, 404 * rows), 'white')
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * tw, (i // cols) * 404))
sheet.save(out)
`,
};

const handlers = { concept, model, finalize, sheet, ship };
if (!handlers[cmd]) { console.error('usage: gen-terrain.mjs <concept|model|finalize|sheet|ship> [--only a,b] [--reseed]'); process.exit(2); }
await handlers[cmd]();
save();
