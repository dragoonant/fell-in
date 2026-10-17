# UI art prompts (Flux Studio, klein)

Prompts only; the generated sources stay outside the repo (work dir of `tools/local-gen/gen-art.mjs`). Original designs, no franchise names, logos or text in any prompt. Shared style suffix:

> painterly digital illustration, muted wasteland palette of dusty ochre, rust and faded teal, soft film grain, no text, no letters, no logos, no watermark

## Key art

- **start-screen** (1920x1080, aspect 16:9, 2 MP): A wide painted vista of a ruined desert highway at golden hour, a collapsed roadside gas station silhouetted against a huge low sun, rusted car husks along a cracked road, dust haze, dramatic layered clouds, broken signposts without any writing, empty open ground on the left third of the frame, cinematic matte painting, no people
- **victory** (1280x720, aspect 16:9, 1 MP): A hopeful painted wasteland sunrise: warm light spreading across cracked ground and a ruined city skyline, a patched cloth banner on a pole planted atop a heap of scrap metal in the foreground, a small cooking fire with rising smoke, clearing sky, cinematic matte painting, no people
- **defeat** (1280x720, aspect 16:9, 1 MP): A grim painted wasteland dusk: smouldering wreckage and a toppled scrap barricade on a darkening plain, heavy storm clouds with a sullen red glow on the horizon, drifting ash, abandoned equipment crates, a lone broken lantern on the ground, cinematic matte painting, no people

## Scenario establishing shots (768x432, aspect 16:9, 1 MP)

- **ga-1**: A painted establishing shot of a ruined highway overpass at the edge of the wastes, patches of glowing green radioactive ground spread across the cracked road, a single supply crate waiting in the distance and a rusty exit gate beyond it, no people
- **ga-2**: A painted establishing shot of an old scrapyard turned into a shooting range, five dented tin cans lined up on a rusty oil drum rail in the foreground, stacked wrecked cars and corrugated fences behind, late afternoon light, no people
- **ga-3**: A painted establishing shot of overgrown allotment gardens in a ruined settlement, five swollen unnatural pulsing pods on thick twisted vines among rotten raised beds and broken fences, sickly green glow, no people
- **ga-4**: A painted establishing shot of a frontier settlement edge at dusk, several large packed-earth burrow mounds scattered between shacks and sandbag walls, dark holes in the mounds, a rifle leaning on a fence post, no people
- **box-1**: A painted establishing shot of a ruined industrial yard where three hulking riveted steel exoskeleton suits stand in a line across the middle, each on a rusty gantry frame, dusty light through broken roof beams, no people
- **box-2**: A painted establishing shot of a salvage yard maze of stacked rusty shipping containers with plain unmarked sides, a large unexploded bomb with a fat rounded body standing upright in the central clearing, plain black and yellow diagonal-striped barrier tape and barrels around it, tense orange evening light, no people
- **box-3**: A painted establishing shot of a ruined schoolhouse with barricaded windows made of desks and planks, a few intact old books on a windowsill glowing in the light, faded chalkboard inside the open door, overgrown yard, no people
- **box-4**: A painted establishing shot of a tall rusty radio tower on a rocky hill with sandbag emplacements and sheet-metal barricades around its base, antenna dishes tilted, wind-blown dust, approaching dusk, no people
- **box-5**: A painted establishing shot of a ring of ruined brick buildings around a central open yard with a lone iron cage-like post, collapsed walls and burned-out windows, smoky red sky, no people
- **ai-rr**: A painted establishing shot of an abandoned truck stop: a giant scrap-built rocket sculpture with a rounded nose, three fins and weathered rust-orange and cream plating standing beside a cracked parking apron, a worn-out roadside diner with a sagging roof and a blank empty signboard on the other side, long shadows, no people
- **ai-missile**: A painted establishing shot of a dusty plain where a long missile lies on a heavy steel sled with chains, deep drag marks in the dirt leading toward the far edge, ruined pylons in the distance, hazy sky, no people
- **ai-breakin**: A painted establishing shot of a walled compound of corrugated metal and concrete slabs around a large old water valve wheel and pipes, a gap in the wall and watchtower scaffolding, dim blue dawn light, no people
- **ai-tech**: A painted establishing shot of a wreckage field of crashed vehicles and twisted metal scattered across a dry basin, small overturned markers and tarps among the debris, hiding spots between the wrecks, hazy sun, no people
- **coop-sewer**: A painted establishing shot of a cracked concrete courtyard with a round rusted sewer hatch in the middle, a few emergency supply boxes scattered around it, collapsed buildings on the sides, cold moonlit tones, no people
- **coop-cage**: A painted establishing shot of an empty raider fighting pit built from scrap walls and welded fences, junk scattered across the empty sandy floor, hanging chains and crude spotlights, empty dark spectator tiers above, smoky light, nobody present
- **coop-munitions**: A painted establishing shot of a fortified base corner with a stack of old crates and rusty munitions barrels in the foreground, two long concrete walls splitting the ground, a dusty approach road in the distance, red warning light glow, no people

## Portraits (256x256)

Units with a concept PNG in art/unit-concepts: Flux image edit of a square head crop (crop boxes in art-batch.json), prompt:

> Same character, head and shoulders portrait, painted, muted wasteland palette, plain dark background

Units without one: text-to-image 1:1 from the template

> A head and shoulders character portrait of {desc}. Mildly stylized heroic proportions, detailed, not cute, painted, muted wasteland palette, plain dark background, no text, no logos

- **knight**: a disciplined armoured soldier in a battered steel-plated combat harness and a closed visor helmet with a plain unmarked front, grim and professional
- **initiate**: a young recruit in a padded grey tunic with mismatched scavenged shoulder plates and a rolled cloth cap, nervous but determined, short hair
- **paladin**: a veteran heavy warrior in massive rust-red and grey riveted powered plate armour, a round sealed helmet with a narrow glowing visor slit, commanding presence
- **field-scribe**: a scholarly field technician in a hooded dark-red robe over a canvas work vest, round brass goggles, ink-stained fingers, a satchel strap across the chest
- **machine-gun-turret-mk1**: a squat automated machine gun turret on a sturdy tripod, riveted gunmetal housing, a single small amber sensor lens, an ammunition belt feeding in from a box

## Faction marks

Hand-written SVG in public/assets/art/marks/ (survivors, super-mutants, brotherhood, creatures); not generated.
