# Aesthetic Bible — Aftergrowth

Status: **v0.3 — in the game** (2026-10-25). See DEVLOG.md for how it evolved.

User feedback on v0.1 concept art: too detailed / realistic. Direction is now **simple low-poly**:
chunky shapes, flat palette colours, no textures, soft toon ramp. Target images:
`art/concept/simple-day.png`, `simple-night.png`, `simple-witch.png`. The detailed v0.1 art
(`art/concept/v1-detailed/`) stays as mood reference only. In-game captures: `art/ingame/`.

## Pillars
1. **Soft world, inked magic.** World = soft-toon 3D (Tolan's World): no outlines, blobby shapes, painterly gradients. Magic = hand-drawn ink (Witch Hat Atelier): fine pen lines, crosshatch, gold-ink glow. Magic must look *drawn onto* the world.
2. **Diorama in the sky.** Fixed orthographic iso camera (~35° tilt, 45° yaw). Each island is a floating diorama with rock/root underside, waterfalls into clouds.
3. **Grown, not built.** Solarpunk tech is organic: glass + brass + vines + leaf-shaped panels, stained glass. No grey concrete, no plastic.
4. **Always alive.** Nothing fully still. Every screen has at least: wind sway, one critter, floating particles, moving water or clouds.

## Camera
- Orthographic, yaw 45°, pitch ~35°. Zoom range 0.7×–1.6×. Smooth follow (critically damped).
- Tilt-shift DoF: sharp band around player, soft blur top/bottom.
- Clouds below islands parallax slowly.

## Palette (hex)
### Day
| token | hex | use |
|---|---|---|
| sky-top | `#7FC8F2` | sky gradient top |
| sky-horizon | `#CFEFFF` | sky gradient bottom |
| cloud | `#F4F8FF` | clouds |
| grass-lime | `#A8D84A` | lit grass |
| grass-mid | `#7DBE3A` | grass base |
| moss-deep | `#4E8F2E` | grass shadow, moss |
| foliage-teal | `#2F7A62` | cypress, pines |
| foliage-deep | `#1E5A50` | foliage shadow |
| water-cobalt | `#2F7FD8` | deep water |
| water-shallow | `#5FB4F0` | shallow water, waterfall |
| rock | `#A39A8E` | island rock |
| rock-shadow | `#6E6672` | rock underside (violet bias) |
| wood | `#A86F45` | bridges, crates |
| cream | `#EADCC4` | cottage walls, parchment |
| brass | `#C99A3E` | solarpunk metal |
| flower-pink | `#F28CC0` | accents |
| flower-yellow | `#F7D34A` | accents |
| flower-blue | `#4C7BE8` | accents |
| shadow-tint | `#5B4A8A` | multiply tint on shadows |

### Golden hour
sky `#F6B08A` → `#C9A6E0`, sun `#FFD08A`, shadow-tint `#7A4E7E`, rim light `#FFB86B`.

### Night
sky `#141A44` → `#3A2F6E`, moonlight `#A8C4FF`, shadow-tint `#141633`, firefly `#FFE27A`, bio-cyan `#5FF2E0`, bio-pink `#FF7FD1`, window-warm `#FFB560`.

### Ink (magic + UI)
ink `#2A2230`, sepia `#5A3E2B`, gold-glow `#FFC94D`, parchment `#F3E6C8`.

## Shading
- Toon ramp, 3 soft bands (not hard cel). Ramp texture shared by all materials.
- Shadows tinted (`shadow-tint` per time of day), never neutral grey.
- Baked soft AO in vertex colors. Hemisphere light: sky color above, grass bounce below.
- No outlines on world. Ink lines reserved for magic, UI, map.
- Bloom only on emissive (fireflies, glyphs, windows, bio flora).

## Shape language
- Round, chunky, slightly oversized props. Bevel everything. Trees = stacked blobs or teardrop cypresses.
- Sharp geometry only: witch hat tip, glyph circles, stained-glass lead lines.
- Chibi proportions: characters ~2.5 heads.

## Character — apprentice witch

**Built as a soft-primitive chibi** (`tools/blender/build_chibi.py`): big round head, dot eyes with a shine, blush, brown bob with bangs, cream dress, moss cape, stubby limbs, a curled indigo hat. Animated in code. Hat colour is each player's own.

Original brief:
Oversized wide-brim pointy hat (indigo, sash, charm, feather), short moss-green hooded cape with gold glyph trim, cream tunic, satchel with ink bottles + parchment, dip-pen/quill as tool, brown boots.

## Day/night cycle
Real-time clock (configurable; default 1 game day = 24 min). Keyframes: dawn 06, day 09–16, golden 17–19, night 20–05. Palette, light dir, fog and particle sets lerp between keyframes. Night adds fireflies, bio-glow flora, lit windows/lanterns.

## Alive checklist
- [ ] Grass + flowers wind sway (vertex shader, noise gusts)
- [ ] Tree canopies breathe/sway
- [ ] Butterflies (day), fireflies (night), pollen motes (golden)
- [ ] Waterfall + pond UV flow, ripples near player
- [ ] Clouds drifting below/around islands
- [ ] Birds crossing sky occasionally
- [ ] Critters: bunny, frog, fox — idle wander
- [ ] Windmill rotation, lantern flicker, chimney smoke
- [ ] Footstep dust/petal puffs, grass bends around player

## UI direction
Parchment + ink. Hand-lettered display face, quiet serif body. Frames drawn with pen strokes, gold-ink highlights. Icons as small ink sketches.

## References
- Tolan's World (Pinterest board "Tolan's World") — world rendering target
- Witch Hat Atelier (Kamome Shirahama) — magic, glyphs, costume, UI ink
- A Short Hike, Alba: A Wildlife Adventure — cozy readability, critters
- Townscaper, Monument Valley — diorama framing, soft palette
- Sky: Children of the Light — floating islands, light mood
- Studio Ghibli skies (Laputa, Kiki) — golden hour, clouds
- Concept art in `art/concept/` (Codex image gen; prompts alongside)
