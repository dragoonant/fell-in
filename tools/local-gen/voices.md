# Narrator voice (Qwen3-TTS, Audio Studio)

Chosen for all spoken lines: `model: qwen-custom`, `speaker: Ryan`, `language: English`.

Delivery note (`instruct`), the same for every line:

> Gravelly, weary, dry baritone narrator with a low pitch and a slow, measured, deadpan pace, like an old wasteland drifter telling a story by a fire.

## Audition (the "welcome" line, seed 41)

| speaker | length | median pitch | verdict |
|---|---|---|---|
| Ryan | 6.2 s | about 140 Hz | chosen: lower and slower, which reads weary |
| Aiden | 6.0 s | about 183 Hz | brighter and quicker, too young for the part |

Measured with an autocorrelation pitch estimate on the raw 24 kHz wav, so this is a numeric pick; the owner's ear
can overrule it on `public/sounds.html` (change `speaker` in `tools/audio-manifest.json`, delete `public/audio/voice/*.mp3`,
rerun `node tools/gen-audio-local.mjs --kind voice`).

## Pipeline notes

- Lines live in `tools/audio-manifest.json` (kind `voice`). Briefings are 2 to 4 spoken sentences per scenario in our own words,
  never the card or rulebook text.
- Output is trimmed, normalised to RMS about 0.12 (peak ceiling 0.88) and encoded as 44.1 kHz mono mp3 at 64 kbps.
- A take is redone with a new seed (at most 2 retries) when it comes back silent, clipped or too short.
