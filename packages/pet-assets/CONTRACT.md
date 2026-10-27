# Shared Eevee-family sprite contract

The canonical runtime pack is `packages/pet-assets/public/mochi/`. It contains real 2D pixel sprites from the pinned SpriteCollab source, preserving original colors and authored frames.

## Manifest and playback

Version 2 uses `render: "sprite-sheet-2d"`, 256-pixel tiles, eight columns, four rows and 32 frames per atlas. Atlases are 2048×1024 non-interlaced 8-bit RGBA PNGs. Display with nearest-neighbor pixel rendering.

Each clip declares action, species in `skin`, actual direction, frameCount, loop, duration, atlas paths and `frameDurationsMs`. The hold array has one duration per original drawing and is authoritative. `fps` is a fallback average. XML durations convert at 20 ms per tick, matching SpriteBot's preview exporter. Runs reuse walking drawings at a declared faster rate. There is no interpolation or manufactured duplicate-frame padding.

Frame i uses atlas floor(i/32), column (i%32)%8 and row floor((i%32)/8). Empty final-atlas cells remain transparent. Single-frame source poses are valid and need no continuing redraw timer.

## Characters and directions

Species IDs: eevee, vaporeon, jolteon, flareon, espeon, umbreon, leafeon, glaceon, sylveon. Eevee is the default. Old coat IDs migrate to Eevee.

Source rows are front (south), front-right, right, back-right, back, back-left, left and front-left. Some animations provide only a front row. Preserve that availability and use nearest available direction fallback. Do not relabel a front drawing as eight distinct views.

The 13 core interaction keys remain idle, walk, run, turn, stretch, groom, pounce, play, feed, happy, sleep, alert and carry. `sourceAnimation` and `sourceResolved` disclose the actual source, including original CopyOf aliases. Species without Eat use a happy Hop reaction to feeding. The groom key selects a species-specific tail movement or special gesture.

The complete source catalog uses safe `pmd_<lowercasename>` action IDs. `sourceActionsCatalog` declares action, label, sourceName, skins and directionsBySkin. All 44 available source action names and their actual rows are represented across the nine species. Core aliases intentionally share atlas pages with their declared source clip.

## Alignment and provenance

Frames align to the precise white ground marker in the original Shadow sheet. This preserves jumps and poses without recentering individual visible bodies. Fixed integer scale and ground anchor per species are recorded in manifest `species` metadata. Colors and drawings are unchanged.

Original PNG, XML, shadow, offset and credit-history files live under `source/spritecollab/<species>/`. `source/SOURCE.json` pins commit 989a2b0d7272e382a0fb51bb611f744256adafbc and SHA-256, size and immutable URL for all 743 source inputs. Runtime SOURCE.json and LICENSE-SpriteCollab.md are exact copies. CREDITS.md identifies contributors, rights holders, modifications and non-commercial artwork terms. The application code's MIT license does not cover Pokémon artwork.

## Rebuild and limits

Run `python packages/pet-assets/tools/build_sprites.py` with Python 3.11+ and Pillow for a fully offline rebuild. It also exports matching Eevee application icons. `fetch_sprites.py --verify` checks input hashes offline. Optional fetching accepts `--checkout PATH` for a SpriteCollab Git checkout at the exact pinned revision.

Cache at most three decoded atlases. Pause hidden/offscreen/resting players and wake at actual source frame boundaries. Supported bounds: 4096 clips, 1800 frames per clip, holds of 16–120000 ms and total clip duration at most ten minutes.
