# tools/local-gen

Scripted access to the three local studios (Flux Studio 7880, Audio Studio 7890, Hunyuan Studio 7860).
Job fields are in `docs/spec/sources/LOCAL-STUDIOS.md`. No dependencies, Node 24.

```
node tools/local-gen/studio.mjs <flux|audio|hunyuan> '<json body>' [--out dir] [--pick N] [--timeout minutes]
node tools/local-gen/studio.mjs flux @body.json --out art/tmp
```

Strings in the body: `"@file:<path>"` becomes a data URL of that file (flux `images[]`, audio `ref`);
`"@b64:<path>"` becomes raw base64 (hunyuan `image`). Use forward slashes in paths. `STUDIO_HOST` overrides 127.0.0.1.
The CLI prints progress, downloads every output as `<out>/<jobid>-<file>` and exits 1 on failure.

Library use: `import { submit, wait, listFiles, download, cancel, pick } from './studio.mjs'`. `wait` survives a studio
restart (connection refused is retried for 2 minutes).

Smoke outputs land in `tools/local-gen/smoke/` (gitignored).

Starting a studio that is down (in the background): `node server.js` in the studio's folder under
`3D Model Generation` (Hunyuan 7860 at the root, `flux-studio/`, or `audio-studio/` in its worktree).

## Timings measured (RTX 5080)
- Flux klein text-to-image 1024x1024: 9 s warm. Image edit: 59 s (model swap included).
- Audio sfx 2 s: 6 s run. Voice (Qwen preset): 18 s on first load. Music is minutes for 60 s of audio.
- Hunyuan image-to-3D, Fast, textured: 172 s.

## Gotchas
- One shared GPU and one queue per studio. Another session's job made audio wait 6 to 7 minutes; `queued` is
  normal, so give `--timeout` room. Never kill a process you did not start.
- File routes differ: Flux and Audio use `/files/<id>/<name>`, Hunyuan uses `/api/jobs/<id>/files/<name>`.
  Done words differ too: `done` vs `completed`.
- Flux has no free width and height, only `aspect` (about 1 MP) and `megapixels`. Edit output copies reference 1's
  shape, so a 16:9 reference gives a 16:9 result; crop the source first for a portrait figure.
- Flux edit ignores negations ("no weapon" still drew a rifle). Say what is wanted, not what is absent.
- Hunyuan `image` is raw base64 (no `data:` prefix). `quality` and `faces` are UI names for `octree`, `steps`
  and `faceCount`. Text-to-3D pauses at `awaiting_pick`; the CLI auto-picks candidate 0.
- Audio SFX are stereo FLAC and voice is 24 kHz mono WAV: encode to mp3 before committing.
- Never name the franchise or a studio in a prompt (IP rule in CLAUDE.md).

## Hunyuan Studio does not queue (terrain stage, 2026-10-17)
Parallel submissions to port 7860 run at the same time and fail out of memory. Submit one Hunyuan job at a time (about 3 minutes each) and retry failures; `gen-terrain.mjs` does this. Flux and the Audio Studio do serialise their own jobs.
