export const meta = {
  name: 'm5-look-sound',
  description: 'M5 look and sound from the local AI studios (Flux images, Audio Studio SFX/music/voice, Hunyuan Studio 3D): one stage per run via args.stage',
  phases: [
    { title: 'Probe', detail: 'one agent: studio client + smoke job per studio + API notes' },
    { title: 'Sound', detail: 'SFX, music and narrator batches (GPU, sequential) in parallel with the file-backed audio client' },
    { title: 'Terrain', detail: 'themed terrain pieces (Flux concept -> Hunyuan 3D) in parallel with themed boards and flat procedural pieces' },
    { title: 'Poses', detail: 'hold-pose figure variants (Flux edit -> Hunyuan 3D) with grip and support sockets, then gallery check' },
    { title: 'UI', detail: 'original key art, scenario previews, portraits and markings (Flux) wired into the client' },
    { title: 'Check', detail: 'screenshots, audition page, typecheck/test/build, STATUS section' },
  ],
}

// Usage: Workflow({ scriptPath, args: { root, studios, stage } })
//   root     absolute path of this repo checkout (the cwd resets between agents)
//   studios  absolute path of the sibling "3D Model Generation" project (Hunyuan Studio root; flux-studio/ and the
//            audio-studio worktree live under it)
//   stage    probe | sound | terrain | poses | ui | check   (one per run; commit and push between runs)
const ROOT = args && args.root
const STUDIOS = args && args.studios
const STAGE = args && args.stage
if (!ROOT || !STUDIOS || !STAGE) throw new Error('pass args.root, args.studios and args.stage')

const COMMON = `Project root: ${ROOT} (use absolute paths everywhere; the cwd resets). Orient from STATUS.md only, then HANDOFF.md section "Current state (2026-10-17)", then only the files named below.
LOCAL STUDIOS (owner-approved GPU use for M5; another session may be using the same GPU, so expect queued or slow jobs and never kill a process you did not start):
  Flux Studio   http://localhost:7880  (images; FLUX.2 klein text-to-image and image edit)
  Audio Studio  http://localhost:7890  (music: ACE-Step 1.5; sfx: Stable Audio Open; voice: Qwen3-TTS presets/design/clone, Chatterbox)
  Hunyuan Studio http://localhost:7860 (image or text to 3D; start it with "node server.js" in ${STUDIOS} in the background if it is down)
  Each takes POST /api/jobs (JSON), GET /api/jobs/<id>, GET /api/jobs/<id>/files/<name>; one GPU job at a time, queued.
  The job parameter names are in ${ROOT}/docs/spec/sources/LOCAL-STUDIOS.md once the probe stage has run; the source of truth is the studio code under ${STUDIOS} (server.js, flux-studio/server.js, the audio-studio worktree under .claude/worktrees/, and each static/app.js for the request bodies the UI sends).
  Use ${ROOT}/tools/local-gen/studio.mjs (the shared client) and read ${ROOT}/tools/local-gen/README.md first (measured timings and gotchas: the queue can hold another session's jobs for 5-7 minutes, Flux has aspect buckets not free sizes, Flux edit copies the reference's shape and ignores negations, Hunyuan takes octree/steps/faceCount). Flux and Audio Studio jobs: submit a batch of up to 8 at once and collect them as they finish; those two studios serialise the GPU themselves. Hunyuan Studio does NOT queue (parallel submissions run at once and fail out of memory): submit ONE Hunyuan job at a time, about 3 minutes each, as tools/local-gen/gen-terrain.mjs does. ElevenLabs is NOT used.
IP rule: every prompt asks for an original design; no Modiphius, Bethesda, Fallout or Vault-Tec art, logos, Vault Boy, Pip-Boy or trade dress; never name the franchise or a studio in a generation prompt. Proportions in plain words ("mildly stylized heroic proportions, about four and a half heads tall, detailed, not cute"); never the banned words from CLAUDE.md. All prose (voice lines, UI copy) in our own words.
FROZEN CONTRACTS: src/engine/{types,decider,view,rng,pending}.ts are frozen; the engine owns every number the UI shows.
Run long commands in the FOREGROUND (except a dev server or a studio server, which go in the background). Never npm install, never git commit, never edit package.json or STATUS.md unless told to. Never write the owner's real name or a C:\\Users\\<name> path into any repo file (derive paths from process.env.USERPROFILE or os.homedir()). Generated source images and concept PNGs never go into the repo except under art/ when a prompt says so; big binaries go through tools/models/optimize.mjs (GLB) or are encoded as mp3 (audio).`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const KEEP = 'Return the schema object only; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

// Frozen audio manifest shape (written by the generator, read by the client):
const AUDIO_MANIFEST = `public/audio/manifest.json = { "version": 1, "sfx": { "<id>": "audio/sfx/<id>.mp3" }, "music": { "<mood>": "audio/music/<mood>.mp3" }, "voice": { "<id>": "audio/voice/<id>.mp3" } }
  sfx ids: every id in src/client/audio/synth.ts RECIPES (the client falls back to the synth recipe when a file is missing) plus per-unit death ids "death-human", "death-mutant", "death-dog", "death-deathclaw", "death-robot", and "radiation", "objective", "search", "heal", "climb", "fall".
  music moods: "menu", "calm", "battle", "victory", "defeat" (menu/calm/battle are seamless loops of 60-90 s; victory/defeat 15-25 s stings), all instrumental.
  voice ids: "briefing-<scenarioId>" (one per scenario in data/1e/scenarios/scenarios.json, reading that scenario's briefing story and goal in our own words, 15-35 s), "round-1".."round-4", "last-round", "your-turn", "victory", "defeat", "welcome" (start screen, once).
  Relative paths are resolved against import.meta.env.BASE_URL. Files are 44.1 kHz mp3 (sfx mono, music stereo).`

// Frozen terrain batch (slug, theme, size [w, d, h] in inches, rulesType) shared by the assets and boards agents:
const TERRAIN_BATCH = [
  ['ruined-house-shell', 'suburbs', [8, 7, 6], 'building'],
  ['collapsed-garage', 'suburbs', [6, 5, 3.5], 'building'],
  ['picket-fence-run', 'suburbs', [6, 0.4, 1.3], 'obstacle'],
  ['mailbox-row', 'suburbs', [3, 0.6, 1.5], 'obstacle'],
  ['rusted-playground-frame', 'suburbs', [4, 3, 3], 'obstruction'],
  ['fallen-lamp-post', 'suburbs', [6, 1, 0.8], 'obstacle'],
  ['gas-pump-pair', 'red-rocket', [2.5, 1.2, 2], 'obstacle'],
  ['service-bay-lift', 'red-rocket', [4, 3, 2.5], 'obstruction'],
  ['roadside-billboard', 'red-rocket', [6, 1, 5], 'obstruction'],
  ['tyre-mountain', 'red-rocket', [4, 4, 2.2], 'obstacle'],
  ['crushed-car-stack', 'junkyard', [5, 2.5, 4], 'obstruction'],
  ['scrap-press', 'junkyard', [4, 3, 3.5], 'obstruction'],
  ['scrap-wall-section', 'junkyard', [6, 0.8, 2.5], 'obstruction'],
  ['appliance-heap', 'junkyard', [3.5, 3, 2], 'obstacle'],
  ['rusted-crane-base', 'junkyard', [3, 3, 5], 'obstruction'],
]
const terrainList = TERRAIN_BATCH.map(([s, t, sz, r]) => `${s} (${t}; ${sz.join('x')} in; ${r})`).join('; ')

// Frozen pose variants: manifest units.<id>.poses.<class> = { file: "units/<id>@<class>.glb", hand, support, yaw?, height? }
// (shape from tools/workflows/m4f-pose-pilot.js; the client already renders it).
const POSE_RULES = `Which (unit, class) pairs need a pose GLB: read data/1e/scenarios/scenarios.json and data/1e/units/*.json, list every weapon each unit carries in any scenario force, classify with weaponClassOf in src/client/figures/equipped.ts, and keep the classes long, heavy and melee2 (pistol, melee1, thrown and natural attacks use the default figure). Skip pairs that already have a listed pose in public/assets/models/manifest.json; regenerate super-mutant@heavy (its launcher pointed sideways: the pose must shoulder the weapon so a line from the trigger hand through the support hand runs forward and slightly up). Expect about 10-15 GLBs.`

const phaseOf = { probe: 'Probe', sound: 'Sound', terrain: 'Terrain', poses: 'Poses', ui: 'UI', check: 'Check' }
if (!phaseOf[STAGE]) throw new Error('unknown stage ' + STAGE)
phase(phaseOf[STAGE])

if (STAGE === 'probe') {
  const r = await agent(`${COMMON}
You own ONLY: tools/local-gen/studio.mjs (new), tools/local-gen/README.md (new), docs/spec/sources/LOCAL-STUDIOS.md (new), one added line in .gitignore ("tools/local-gen/smoke/"), and the untracked folder tools/local-gen/smoke/.
Goal: prove each studio works from a script before anything fans out.
1. Read the studio code under ${STUDIOS}: server.js (Hunyuan Studio, job body: mode image|text, image base64, prompt, name, params such as conceptModel, candidates, quality, faces, texture, removeBase; status awaiting_pick needs POST /api/jobs/<id>/pick), flux-studio/server.js and flux-studio/static/app.js (mode text|edit, model, prompt, width/height or aspect, steps, guidance, seed, count, images[] as data URLs), and the audio-studio folder in the newest worktree under ${STUDIOS}/.claude/worktrees/ (server.js, static/app.js, tts/tts_server.py: modes music|sfx|foley|voice and their fields, e.g. prompt, avoid, duration, variations, lyrics, bpm, key, model, text, speaker, instruct, exaggeration, cfg_weight, language, ref as data URL). Record every field with its type and default in docs/spec/sources/LOCAL-STUDIOS.md (short tables; cite the file each came from).
2. Write tools/local-gen/studio.mjs (plain ESM, Node 24, no dependencies): submit(studio, body), status(studio, id), wait(studio, id, {onLog, timeoutMs}) that polls until done/failed/cancelled and tolerates connection refused for up to 2 minutes (studio restarting), listFiles(studio, id) and download(studio, id, name, destPath), plus a tiny CLI: node tools/local-gen/studio.mjs <flux|audio|hunyuan> '<json body>' [--out dir] that submits, waits, prints progress lines and downloads every output file. Studios are keyed by name with their ports; honour STUDIO_HOST env (default 127.0.0.1).
3. Smoke-test through the CLI into tools/local-gen/smoke/: (a) audio sfx 2 s "a single bolt-action rifle shot in an open dusty field, dry, no music"; (b) audio voice, Qwen preset speaker Ryan (or the closest preset the studio lists at its voice endpoint) with an instruct for a gravelly, weary wasteland narrator, text "The dust settles. Nothing moves. Then the first shot."; (c) flux klein text-to-image 1024x1024 "a rusted roadside mailbox cluster on a cracked concrete base, single object, isolated on a plain white background, soft even light, no text"; (d) flux klein image edit of ${ROOT}/art/unit-concepts/sole-survivor.png with "same character, same outfit and colours, now standing in a two-handed rifle stance at low ready, both hands closed as empty fists as if gripping a rifle, no weapon, full body, round black base, plain white background"; (e) Hunyuan Studio image-to-3D of the mailbox image from (c) at the Fast preset with texture on. Start Hunyuan Studio in the background if port 7860 is down. Look at every output (Read the PNGs; for audio run "npx tsx tools/measure-audio.ts" on the clip if it accepts a path, else report the file sizes and durations via a quick node script) and note what worked.
4. Write tools/local-gen/README.md: how to run the CLI, the timings you measured per studio, and the gotchas.
Report each studio's result and timing in issues (one line each). ${KEEP}`,
    { label: 'probe:studios', phase: 'Probe', schema: RESULT, model: 'sonnet' })
  return { probe: r }
}

if (STAGE === 'sound') {
  const [assets, client] = await parallel([
    () => agent(`${COMMON}
You own ONLY: tools/audio-manifest.json (rewrite), tools/gen-audio-local.mjs (new), public/audio/** (new files), public/audio/manifest.json, public/sounds.html (new audition page), tools/local-gen/voices.md (new).
Read tools/local-gen/README.md and docs/spec/sources/LOCAL-STUDIOS.md first, then docs/KNOWLEDGE-BASE.md section 3.3 (prompt lessons, loudness targets, the audition loop) and src/client/audio/{synth.ts,cueSounds.ts} and src/client/weaponFlavour.ts for the ids in use.
FROZEN: ${AUDIO_MANIFEST}
Build tools/gen-audio-local.mjs on tools/local-gen/studio.mjs: idempotent (skips ids whose mp3 exists), --kind sfx,music,voice, --only prefix, --dry; converts the studio's wav/flac to mp3 with the @breezystack/lamejs devDependency (or ffmpeg if "ffmpeg -version" works), writes public/audio/manifest.json from what is on disk. Entries live in tools/audio-manifest.json with the studio request per item (prompt, avoid, seconds, seed; music: style tags, bpm, key, seconds, instrumental; voice: model, speaker, instruct, text).
Then generate, queued in batches of up to 8 jobs: (1) every sfx id (about 40-50; describe the MECHANISM not the name, list exclusions, 0.5-1.5 s for shots and hits, 1.2-3 s for deaths and explosions, 2-4 s for stings, dice as real dice on wood, UI as short dry clicks), (2) the five music moods (dusty post-war Americana: baritone guitar, bowed bass, distant lap steel, sparse percussion, tape hiss; battle adds low drums and brass; victory and defeat stings resolve or collapse the same motif; no vocals), (3) the voice lines with Qwen3-TTS: pick ONE narrator preset and instruct that reads gravelly, weary and dry (try Ryan and Aiden on the "welcome" line, Read both with a quick measure of duration, pick one, record the choice and the instruct in tools/local-gen/voices.md); briefing texts come from each scenario's briefing in data/1e/scenarios/scenarios.json rewritten into 2-4 spoken sentences in our own words (never read card or rulebook text verbatim), the other lines are short originals you write.
Normalise: run npx tsx tools/measure-audio.ts (read it first for its arguments) and aim for RMS 0.15-0.18 on sfx, gunshots crest >= 8, music about -14 dB under sfx (the client also sets MUSIC_DB), voice RMS about 0.12. Regenerate anything clipped, silent or that came back as music/noise (at most 2 retries per id, new seed).
public/sounds.html: one <audio> at a time, grouped sfx / music / voice, reads public/audio/manifest.json, works on Pages under the base path.
Keep public/audio under about 25 MB total. ${KEEP}`,
      { label: 'sound:assets', phase: 'Sound', schema: RESULT, model: 'sonnet' }),
    () => agent(`${COMMON}
You own ONLY: src/client/audio/** (keep synth.ts recipes as the fallback), src/client/weaponFlavour.ts, src/client/ui/SoundSettings* (new or existing settings UI for audio), tests/client/audio-*.test.ts, and the audio hooks in src/client/ui/{Briefing,GameOver,StartScreen}.tsx and src/client/presentation/* ONLY where a cue is emitted (read first; keep edits minimal).
FROZEN: ${AUDIO_MANIFEST}
Implement a file-backed sound layer over the existing AudioManager: fetch public/audio/manifest.json once (tolerate 404: everything stays synthesised), decode files lazily on first use and cache the AudioBuffer, play the file when present else the synth recipe; keep throttling and detune jitter. Music: MoodPlayer plays the mood's file as a seamless loop with the existing crossfade when a file exists (victory/defeat play once); keep the procedural mood when it does not. Add a "voice" bus (settings slider + mute, persisted like the others) that ducks music by 6 dB while a line plays and never overlaps two lines (queue, drop stale). Triggers: "welcome" once on the start screen's first user click (Web Audio unlock), "briefing-<scenarioId>" when the briefing modal opens for a scenario that has a line, "round-<n>" / "last-round" on the round banner, "your-turn" when the human seat gets its first decision of a round, "victory"/"defeat" on game over, plus the new sfx ids (death by unit kind from the unit's data, radiation, objective, search, heal, climb, fall) where the presentation cues already carry that information (add nothing the engine does not already say). Unit tests with a stubbed AudioContext for manifest parsing, fallback selection, voice queueing and ducking. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
      { label: 'sound:client', phase: 'Sound', schema: RESULT, model: 'sonnet' }),
  ])
  log(`assets: ${assets ? assets.summary : 'FAILED'}`)
  log(`client: ${client ? client.summary : 'FAILED'}`)
  return { assets, client }
}

if (STAGE === 'terrain') {
  const [assets, boards] = await parallel([
    () => agent(`${COMMON}
You own ONLY: public/assets/models/terrain/<new slugs>.glb, the new entries in public/assets/models/terrain/manifest.json, tools/local-gen/terrain-batch.json (new), tools/local-gen/gen-terrain.mjs (new), art/terrain-sheets/m5-*.png (contact sheets only).
Read tools/local-gen/README.md, docs/spec/sources/LOCAL-STUDIOS.md, docs/KNOWLEDGE-BASE.md section 3.2 (terrain sizing, decimation to about 6k tris, the finalize scripts in %USERPROFILE%\\Hunyuan3D-2: finalize_terrain.py / stage_finalize_terrain.py, read them before reusing), public/assets/models/terrain/CREDITS.md and tools/models/optimize.mjs.
FROZEN batch (slug; theme; size w x d x h in inches; rulesType): ${terrainList}.
Pipeline per piece, queued in batches: Flux klein text-to-image concept (aspect 1:1, "a single <description>, weathered post-war wasteland prop, three-quarter view from slightly above, isolated on a plain white background, soft even light, no text, no people"; look at it, regenerate once with a new seed if it is cropped, multiple objects or has a background) -> Hunyuan Studio image-to-3D (octree 384, steps 50, faceCount about 15000, texture 1024, remove display base on) -> finalize: scale so the footprint matches the frozen size (longest side exact, height within 15%), y up, origin at the footprint centre on the ground, decimate to about 6k tris, 1024 texture, optimize with tools/models/optimize.mjs -> write the manifest entry {file, size, rulesType} exactly as the frozen list. Render a contact sheet of all pieces (any quick three.js or Playwright headless render, or the Hunyuan viewer screenshots) to art/terrain-sheets/m5-terrain.png and LOOK at it; redo any piece that is hollow, flat, or unrecognisable (one retry each). Add the source line for each piece to CREDITS.md ("generated locally with FLUX.2 klein and Hunyuan3D 2.1, original prompt"). ${KEEP}`,
      { label: 'terrain:assets', phase: 'Terrain', schema: RESULT, model: 'sonnet' }),
    () => agent(`${COMMON}
You own ONLY: src/engine/terrainCatalog.ts, src/engine/terrain.ts ONLY if a new flat rules type is needed (then also docs/spec/14 section note and an issues line), src/client/board/** (procedural flat pieces and mats), src/client/ui/StartScreen.tsx (theme picker for skirmish only), tests/engine/terrain-*.test.ts, tests/client/board-*.test.ts, public/assets/terrain/** (mats, with CREDITS.md lines).
Read src/engine/terrainCatalog.ts (themedTerrain), src/engine/setup.ts lines 100-240, src/client/board/*, docs/spec/14-range-los-cover-terrain.md sections on terrain types, and public/assets/terrain/CREDITS.md.
FROZEN batch of new GLB pieces another agent is producing right now (slug; theme; size w x d x h in inches; rulesType): ${terrainList}. Add each to TERRAIN_CATALOG with exactly those sizes and types (the GLB files arrive separately; the client must show a procedural box stand-in of the right size when a GLB is missing).
Build three themed boards in themedTerrain: "suburbs" (ruined houses, fences, mailboxes, playground, lamp posts, dead trees, cars), "red-rocket" (the Red Rocket object model stays the scenario's; the board adds pumps, service bay, billboard, tyres, jersey barriers, drums), "junkyard" (car stacks, press, scrap walls, appliance heaps, crane base, containers). Each board: 10-14 pieces, symmetric enough for both seats, no piece inside a deploy zone, at least one LOS-blocking piece per quarter, placement validated by placementBlockers (test it). Add procedural FLAT pieces (image-to-3D cannot make them): a cracked asphalt road strip (2 sizes), a rubble field patch and a radioactive puddle (difficult/hazard per spec 14, using existing rules types), drawn in src/client/board. Per-theme ground mats: reuse the CC0 Poly Haven mat with a theme tint (suburbs greener-grey, red-rocket sun-bleached asphalt, junkyard rust) rather than new downloads. Start screen: a theme picker that applies to skirmish games (scenarios keep their own terrain); ?theme= param. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
      { label: 'terrain:boards', phase: 'Terrain', schema: RESULT, model: 'sonnet' }),
  ])
  log(`assets: ${assets ? assets.summary : 'FAILED'}`)
  log(`boards: ${boards ? boards.summary : 'FAILED'}`)
  return { assets, boards }
}

if (STAGE === 'poses') {
  const assets = await agent(`${COMMON}
You own ONLY: public/assets/models/units/<id>@<class>.glb (new or replaced), the "poses" entries in public/assets/models/manifest.json, tools/local-gen/gen-poses.mjs (new), tools/local-gen/pose-batch.json (new), art/figure-sheets/m5-poses.png.
Read tools/local-gen/README.md, docs/spec/sources/LOCAL-STUDIOS.md, docs/KNOWLEDGE-BASE.md sections 3.2 and 3.4, tools/workflows/m4f-pose-pilot.js (the frozen poses shape and how the pilot measured sockets), public/assets/models/manifest.json (note + existing poses), src/client/figures/equipped.ts (weaponClassOf) and the fist-finding helper in %USERPROFILE%\\Hunyuan3D-2\\fellin_m4d\\fist.py if it exists.
${POSE_RULES}
Per (unit, class), queued in batches: first crop art/unit-concepts/<unit>.png with sharp to a 3:4 portrait around the figure (the edit output copies the reference's shape), then a Flux klein image EDIT with a stance prompt per class (say what IS there, never what is absent: the probe showed "no weapon" still drew a rifle; use "both hands are closed empty fists, fingers curled around nothing, miming a rifle grip"): long = "two-handed rifle stance at low ready, trigger hand at the hip-chest, support hand forward, both hands closed empty fists as if gripping a rifle"; heavy = "shouldered heavy weapon stance, trigger hand under the shoulder, support hand forward and up, both hands closed empty fists"; melee2 = "two-handed grip raised over the shoulder as if holding a long haft, both hands closed empty fists"; always "same character, same outfit and colours, empty hands, full body, standing on a round black base, plain white background". LOOK at each image: reject and retry (new seed, up to 2 times, then reword: "holding an invisible rifle") if the character changed, a weapon appeared, or the figure is cropped; a pair that still fails after that gets a Gemini image through Claude in Chrome on this PC exactly as docs/KNOWLEDGE-BASE.md section 3.1 describes (hidden file input, never the clipboard) if a Chrome is connected, else it is skipped and listed in issues. Then Hunyuan Studio image-to-3D (octree 384, steps 50, faceCount about 12000, texture 1024, keep the base so the finalize step can cut it like the pilot did) -> finalize like the default figure of the same unit (same height, base size, yaw convention, tools/models/optimize.mjs, <= ~2 MB) -> measure the grip-hand and support-hand sockets in the fitted frame (two fists; render orthographic front and side views to confirm which is which) -> write the poses entry. Produce art/figure-sheets/m5-poses.png (front and three-quarter of every new pose with the weapon it will hold, using ?gallery through Playwright at 1280x800 if the dev server is up on 5191, else start it in the background) and LOOK at it; tune sockets so the weapon sits in both hands (up to 3 rounds). ${KEEP}`,
    { label: 'poses:assets', phase: 'Poses', schema: RESULT, model: 'sonnet' })
  log(`poses: ${assets ? assets.summary : 'FAILED'}`)
  return { assets }
}

if (STAGE === 'ui') {
  const [art, client] = await parallel([
    () => agent(`${COMMON}
You own ONLY: public/assets/art/** (new), tools/local-gen/gen-art.mjs (new), tools/local-gen/art-batch.json (new), art/ui-concepts/PROMPTS.md (new, prompts only).
Read tools/local-gen/README.md, docs/spec/sources/LOCAL-STUDIOS.md, src/client/ui/StartScreen.tsx and Briefing.tsx, GameOver.tsx, UnitCard.tsx, Hud.tsx, ObjectiveTracker.tsx to see what surfaces exist, data/1e/scenarios/scenarios.json (briefing stories) and data/1e/units/*.json (unit ids), art/unit-concepts/*.png.
FROZEN output paths (webp, quality 80, via sharp which is a devDependency; Flux only offers aspect buckets at 1 or 2 MP, so generate at aspect 16:9 megapixels 2 or 1:1 and resize or crop with sharp to the exact size): public/assets/art/key/start-screen.webp (1920x1080, a wide painted wasteland vista at golden hour, a ruined gas-station silhouette, no people, no text), public/assets/art/key/victory.webp and defeat.webp (1280x720), public/assets/art/scenarios/<scenarioId>.webp (one per scenario, 768x432, a painted establishing shot from that briefing's story, no text, no characters' faces), public/assets/art/portraits/<unitId>.webp (256x256 head-and-shoulders painted portrait made by Flux klein image EDIT of a square crop of art/unit-concepts/<unitId>.png around the head: "same character, head and shoulders portrait, painted, muted wasteland palette, plain dark background"; units without a concept PNG get a text-to-image portrait from the unit's one-line description in its data record), public/assets/art/marks/<faction>.svg (ORIGINAL faction marks for survivors, super-mutants, brotherhood, creatures: hand-written simple SVG geometry, no raster; nothing that resembles the real franchise emblems). Flux jobs one at a time; LOOK at each result and retry once on text artefacts, extra people or franchise look-alikes. Keep the whole folder under 12 MB. ${KEEP}`,
      { label: 'ui:art', phase: 'UI', schema: RESULT, model: 'sonnet' }),
    () => agent(`${COMMON}
You own ONLY: src/client/ui/** (except SoundSettings*), src/client/theme.ts, src/client/ui/styles.css, tests/client/ui-*.test.ts, tests/e2e/** (only to keep text picks exact).
Another agent is producing these files right now; code against the paths and sizes and fall back gracefully when a file is missing (onError hides the image): public/assets/art/key/start-screen.webp (1920x1080), key/victory.webp and key/defeat.webp (1280x720), art/scenarios/<scenarioId>.webp (768x432), art/portraits/<unitId>.webp (256x256), art/marks/<faction>.svg.
Wire them: start screen background with a dark gradient so text stays readable at 1280x800 and on a phone-width layout; scenario cards show their preview image; the briefing modal shows the scenario image as a header; the unit card and the HUD selection chip show the portrait (fallback: the existing procedural swatch); faction marks next to force names and on the objective tracker; game over shows victory/defeat art behind the banner. Keep every existing data-testid and E2E text pick exactly. Tidy the overlay crowding at 1280x800 noted in STATUS (collapse secondary panels behind toggles). npm run typecheck && npm test && npm run build must pass; npm run e2e where it already passed on main. ${KEEP}`,
      { label: 'ui:client', phase: 'UI', schema: RESULT, model: 'sonnet' }),
  ])
  log(`art: ${art ? art.summary : 'FAILED'}`)
  log(`client: ${client ? client.summary : 'FAILED'}`)
  return { art, client }
}

if (STAGE === 'check') {
  const r = await agent(`${COMMON}
You own ONLY: screenshots/m5-*.png, STATUS.md (a new "## Look and sound (M5)" section only, 8-14 lines, facts only), docs/KNOWLEDGE-BASE.md (append a short section 3.5 "Local studios (FELL M5)" with the lessons from tools/local-gen/README.md), and trivial fixes (typos, a missing import, a wrong path) anywhere they block the checks below.
Run npm run typecheck, npm test, npm run build, npm run validate:data and npm run e2e in the foreground and report failures verbatim (first 10 lines each). Start the dev server in the background only if http://localhost:5191/fell-in/ is down (npx vite --port 5191). With Playwright at 1280x800 (temp script outside the repo, --wait-for-timeout 12000 for WebGL) capture: the start screen; one skirmish game per theme (?theme=suburbs|red-rocket|junkyard&seats=human,bot&seed=7, briefing closed); ?gallery close-ups of three pose variants; the briefing modal of ai-rr; public/sounds.html. Read every screenshot and list in issues anything that looks wrong (blank canvas, missing textures, clipping weapons, unreadable text). Write STATUS.md's section from what you verified, not from the plan. ${KEEP}`,
    { label: 'check:all', phase: 'Check', schema: RESULT, model: 'sonnet' })
  return { check: r }
}
