# Primordia

A prehistoric open-world exploration and survival game that runs in the browser (WebGL 2, Three.js).
Every asset is generated procedurally at startup: no textures, models or audio files.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

A desktop browser with a dedicated GPU is recommended. Pick the graphics preset (Low / Medium / High / Ultra)
in **Settings**; dynamic resolution keeps the frame rate smooth.

## The world (8 × 8 km)

| Region | What's there |
| --- | --- |
| Sunplain Grasslands | Wildflower meadows, Triceratops herds, the Sundial Henge |
| Frostfang Peaks | Snow-capped mountains up to ~1.5 km, a frozen shrine, Frost Hollow cave |
| Mirror Lake and Silverthread Falls | Highland lake spilling off a cliff as a ~170 m waterfall into the Long River |
| Emerald Jungle | Giant trees, tree ferns, hanging vines, raptor packs, the Temple of the Sun Serpent |
| Mount Ignis | Active volcano with a lava lake, smoke plume, lava flows, eruptions and lava bombs, Ember Tube cave |
| Crimson Canyon | Terraced red-rock plateau cut by a deep canyon, Sandstone Sanctum, Ochre Grotto cave |
| Azure Isles | Tropical islands, palm beaches, lagoons with plesiosaurs, the Tidestones |
| Tethys Sea | Open ocean patrolled by mosasaurs |

## Creatures

Brachiosaurus, Triceratops, Velociraptor, Tyrannosaurus rex, Pteranodon, Mosasaurus and Elasmosaurus.
Each one is a procedurally lofted, skinned mesh with scale or feather textures and countershaded colours.
Animation is procedural: gait cycles, tail sway, breathing, head-tracking, jaw, wing flaps and swimming undulation.

They also behave like animals:

- herds graze, drink, browse treetops and flee
- Triceratops charge raptors and anyone who provokes them
- raptor packs stalk, flank and strike together
- the T. rex patrols, roars and chases (it can't follow you into caves or up cliffs)
- pterosaurs ride thermals and dive for fish
- mosasaurs hunt swimmers and breach

## Rendering

- Chunked LOD terrain with per-pixel heightfield normals, procedural splatting (meadow, jungle litter,
  strata, basalt, snow), triplanar detail and ray-marched long-distance terrain shadows
- Ray-marched volumetric cumulus clouds with temporal reprojection, plus cloud shadows on the ground
- Physically based atmosphere (Preetham), stars, moon and a seamless day/night cycle
- Image-based lighting regenerated from the sky as the time of day and the weather change
- Height fog, aerial perspective, screen-space god rays, HDR bloom, ACES tone mapping and colour grading
- Gerstner-wave ocean with shoreline foam and depth colour, lakes, a flowing river and waterfalls with mist
- GPU-placed grass and wildflowers that bend in the wind and around the player, plus ~70k instanced trees
  (near and far LODs with dithered cross-fades) that sway in the wind
- Weather: clear, fair, overcast, rain, thunderstorms with lightning and thunder, dawn mist,
  snow at altitude and wet surfaces

## Playing

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look |
| Shift | Sprint (swim fast) |
| Space | Jump · swim up · leap off a wall |
| C | Crouch (stealthier) · dive |
| W into a steep slope | Climb (uses stamina; icy slopes need climbing picks) |
| E | Gather · interact · drink · butcher · take |
| LMB | Use tool / attack / place building piece / eat |
| RMB + LMB | Aim and throw a spear |
| R | Rotate building piece |
| 1–8, mouse wheel | Hotbar |
| F | Toggle torch / lantern |
| Tab / M / J | Inventory and crafting / map / journal |
| Z | Sleep in a shelter |
| Esc | Pause |

Survive by managing health, stamina, hunger, thirst, warmth and oxygen.

- **Crafting:** axes, pickaxes, flint and obsidian spears, torches, a crystal lantern, waterskins, bandages and climbing picks.
- **Building:** snap-together foundations, walls, doorways, roofs and stairs, plus campfires (cooking, warmth, respawn) and lean-to shelters (sleep, respawn).
- **Secrets:** four glowing tablets lie in four ruins. Return them to the Sundial Henge. Along the way you can find hidden caves with crystals and cave paintings, fossils, and a journal that records every species and place you discover.

Progress autosaves to the browser's local storage.

## Code map

```
src/world/heightgen.js   procedural heightfield (runs in Web Workers)
src/world/terrain.js     LOD terrain + splat shader
src/world/sky.js         atmosphere, volumetric clouds, sun/moon, IBL
src/world/water.js       ocean, lakes, river, waterfalls
src/world/vegetation.js  instanced trees/rocks/plants with LODs, harvesting
src/world/grass.js       GPU grass & wildflowers
src/world/features.js    volcano, caves, ruins, artifacts, light pool, colliders
src/world/weather.js     weather state machine, rain/snow, lightning
src/creatures/*          skinned creature builder, species, behaviour, population
src/player/*             controller, inventory/recipes, building, tools
src/render/*             shared shader code, procedural textures, particles, post-processing
src/audio/audio.js       procedural audio
src/ui/hud.js            HUD, map, journal, crafting UI
```
