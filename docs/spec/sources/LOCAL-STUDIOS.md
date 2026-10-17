# Local studios: job parameters (probed 2026-10-17)

Source of truth is the studio code in the sibling project `3D Model Generation` (relative paths below are inside it;
the audio studio lives in its newest worktree, `.claude/worktrees/ai-audio-generation-packages-*/audio-studio/`).
All three: `POST /api/jobs` (JSON), `GET /api/jobs/<id>`, `POST /api/jobs/<id>/cancel`. One GPU job at a time, queued.
Client: `tools/local-gen/studio.mjs`. The task brief's field names were approximate; these are the real ones.

## Flux Studio, port 7880 (`flux-studio/server.js` `sanitize`, `shared/flux.js`)
Files: `GET /files/<id>/<name>`; outputs listed in `job.images` (`image_0.png`...). Done status word: `done`.

| field | type | default | notes |
|---|---|---|---|
| model | `klein`, `dev`, `schnell` | `klein` | only klein edits; dev 20 steps / guidance 3.5; schnell max 12 steps |
| mode | `t2i`, `edit` | `t2i` | |
| prompt | string (4000) | required | |
| aspect | `1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9` | `1:1` | t2i only; about 1 MP buckets (1:1 = 1024x1024). No free width/height |
| megapixels | 1 or 2 | 1 | scales sides by sqrt 2 for 2; in edit it is the reference scale |
| steps | int 1..maxSteps | model default (klein 4) | |
| guidance | number 0..20 | model default (klein 1) | |
| batch | int 1..4 | 1 | images per job |
| seed | int | random | |
| images | string[] (max 2) | none | edit only; data URLs (png, jpeg or webp, base64). Output takes image 1's shape |

## Audio Studio, port 7890 (`audio-studio/server.js` `sanitize`, `shared/audio.js`, `tts/tts_server.py`)
Files: `GET /files/<id>/<name>`; outputs in `job.audios` (`audio_0.flac` for music and sfx, `voice.wav` for voice); foley adds `video_with_audio.mp4`.
`GET /api/status` lists models, voices, speakers, ACE keys and languages. `mode`: `music`, `sfx`, `foley`, `voice`. `seed` (int, random) on all.

Music (ACE-Step 1.5):

| field | type | default |
|---|---|---|
| prompt | string, style and mood tags | required |
| lyrics | string | `[Instrumental]` |
| duration | seconds 10..240 | 60 |
| steps / guidance / shift | 1..30 / 0..10 / 0.5..10 | 8 / 1 / 3 |
| bpm | 10..300 | 120 |
| key | e.g. `C major`, `A minor` (status.keys) | `C major` |
| timesig | `2`, `3`, `4`, `6` | `4` |
| language | status.languages | `en` |
| batch | 1..2 | 1 |

SFX (Stable Audio Open 1.0): `prompt` (required), `negative` (string), `seconds` 1..47 (default 10), `steps` 1..100 (50), `guidance` 0..15 (5), `batch` 1..4 (1). Output 44.1 kHz stereo FLAC.

Foley (HunyuanVideo-Foley, non-commercial licence): `prompt`, `negative` (`noisy, harsh`), `duration` 1..60 (defaults to clip length), `steps` 10..100 (50), `guidance` 1..10 (4.5), and `video` (data URL mp4) or `videoFrom: {id}`.

Voice (Python engines on ports 7891 Chatterbox and 7892 Qwen, started on demand):

| field | type | default | notes |
|---|---|---|---|
| model | `chatterbox`, `chatterbox-mtl`, `chatterbox-turbo`, `qwen-clone`, `qwen-design`, `qwen-custom` | `chatterbox` | |
| text | string (6000) | required | |
| language | per model (`en`; Qwen: `English`, `Auto`, ...) | first of model | |
| speaker | qwen-custom only: Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee | first | |
| instruct | string (1000) | empty | qwen-custom delivery note; qwen-design voice description |
| ref | data URL (wav, mp3, flac, ogg) | none | clone: required for qwen-clone and chatterbox-turbo, optional for chatterbox, ignored for qwen-design and qwen-custom |
| refText | string | empty | transcript of ref (qwen-clone) |
| exaggeration / cfg / temperature | 0..2 / 0..1 / 0.05..2 | 0.5 / 0.5 / 0.8 | chatterbox knobs (`cfg` is sent as `cfg_weight`) |

Output `voice.wav`, 24 kHz mono (Qwen).

## Hunyuan Studio, port 7860 (`server.js` `createJob`, `sanitizeParams`; `static/app.js` QUALITY)
Files: `GET /api/jobs/<id>/files/<name>`; `job.files` lists everything (`input.png`, `cutout.png`, `concept_<i>.png`, `shape.glb`, `textured.glb`), `job.model` is the final GLB. Done status word: `completed`. Text jobs pause at `awaiting_pick` and need `POST /api/jobs/<id>/pick {"index":N}`. Progress field is `progress` (0..1) with `stage`; queue position is `queuePosition`.
Body: `{mode: 'image' | 'text', image: <raw base64 png, no data: prefix>, prompt (text mode), name, params: {...}}`.

| params field | type | default | notes |
|---|---|---|---|
| texture | bool | true | false skips the paint stage; the model is then `shape.glb` |
| removeBg | bool | true | image mode only |
| seed | int | 1234 | |
| steps | 1..200 | 50 | shape diffusion steps |
| guidance | 0..30 | 5 | |
| octree | 64..1024 | 384 | shape resolution |
| faceCount | 1000..500000 | 40000 | |
| texRes | 512, 1024, 2048 | 1024 | |
| cutBase | bool | false | |
| candidates | 1..8 | 4 | text mode concept count |
| conceptSteps | 5..100 | 30 | |
| style | 0..1 | 0 | |
| negative | string | empty | |
| conceptModel | `sdxl`, `klein`, `dev`, `schnell` | `sdxl` | text mode |

UI quality presets (local): Fast `octree 256, steps 20`; Standard `384, 50`; High `512, 50`. The names `quality` and `faces` are UI-only; the server reads `octree`, `steps` and `faceCount`.

## Smoke results (RTX 5080, shared with another session)

| job | result |
|---|---|
| audio sfx 2 s | 6 s run, 44.1 kHz stereo FLAC of 2.04 s; waited 350 s in queue behind another session |
| audio voice qwen-custom Ryan | 18 s run (first load), 6.64 s WAV; waited 410 s in queue |
| flux klein t2i 1024x1024 | 9 s total, clean isolated mailbox cluster |
| flux klein edit, 1 reference | 59 s total (model swap included); character kept, but "no weapon" was ignored and the output holds a rifle |
| hunyuan image-to-3D, Fast, textured | 172 s, 40k-face textured GLB of 2.1 MB |
