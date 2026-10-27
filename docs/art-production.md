# Sprite sheets, animation, and credits

Mochi uses transparent 2D pixel sprites for Eevee, Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon, and Sylveon. The website, browser overlay, popup/settings previews, and native Windows companion read the same local manifest and atlas library. Pokémon characters and third-party sprite artwork are separate from the MIT-licensed application code.

## Source and attribution

The source is [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab). Its [repository license](https://github.com/PMDCollab/SpriteCollab/blob/master/LICENSE.md) is Attribution-NonCommercial 4.0. This is a noncommercial fan project. Preserve the supplied credits and license text, including the original-game credits recorded by the source; no official endorsement or ownership of Pokémon artwork is claimed.

- `packages/pet-assets/source/spritecollab/{species}/`: original downloaded PNG sheets, `AnimData.xml`, and `credits.txt` for each companion.
- `packages/pet-assets/source/SOURCE.json`: pinned repository revision, source URLs, and SHA-256 receipts.
- `packages/pet-assets/source/LICENSE-SpriteCollab.md`: the source repository's terms.
- `packages/pet-assets/tools/fetch_sprites.py`: optional explicit network refresh of the pinned source inputs.
- `packages/pet-assets/tools/build_sprites.py`: offline Python/Pillow atlas builder.
- `packages/pet-assets/public/mochi/`: runtime `manifest.json`, transparent atlases, static companion posters, `CREDITS.md`, `SOURCE.json`, and `LICENSE-SpriteCollab.md`.

Ordinary application builds validate and reuse committed artwork. They do not fetch sprites or require Python. The unified project ZIP retains the source sheets, timing, provenance, and credits alongside the app source. Abandoned 3D models and render prototypes are excluded.

## Rebuild the sprites

For artwork changes, install Python 3.11+ and Pillow. Run the offline builder from the repository root, then validate its output:

```sh
python -m pip install Pillow
python packages/pet-assets/tools/build_sprites.py
npm run validate:assets
npm test
npm run build
```

Keep source sprites and XML together. The builder reads XML timing in the source engine’s 20-millisecond ticks and keeps every available directional row (one or eight in these source sheets), preserves transparent pixels, places frames consistently on the runtime canvas, and writes posters and manifest metadata. The pinned source set contains between 13 and 36 source animations per companion; no extra motion frames are invented. Retain the source receipt whenever you modify or replace a sheet. Fetching upstream updates is a separate optional action; normal builds do not silently substitute newer artwork.

## Runtime contract

The version-2 manifest uses `render: "sprite-sheet-2d"`, 256-pixel tiles, eight columns, four rows, and 32 frames per atlas. Each clip declares its action, companion ID, direction, frame count, fallback frame rate, loop behavior, duration, and atlas paths. Optional `frameDurationsMs` preserves the original variable frame holds instead of flattening them to a single speed.

Core pet states map to available source animations. Several interactions can legitimately share one source animation. Each core alias records its `sourceAnimation`; companions without an Eat animation use a source reaction such as Hop for feeding. A visible feed reaction does not imply a newly drawn eating sequence. The additional `pmd_` action catalog retains available source animations and their true `directionsBySkin` for previewing; one-view source animations stay one-view, and unavailable gallery headings are disabled; a source alias or held frame is not a newly authored animation. Eight-direction walking/running remains distinct from simply moving one static image around the screen.

PNG atlases use non-interlaced 8-bit RGBA. Pixel-art edges may use hard binary alpha. Nearest-neighbor scaling keeps the original pixel appearance. Keep a stable ground/pivot and safe margins so ears, tails, ribbons, and effects are not cropped.

## Validation and visual review

```sh
npm run validate:assets
npm run package:project
npm run verify:project
```

The independent asset checker decodes PNG pixels and checks safe/missing paths, dimensions, transparency, visible nonempty frames, uncropped canvases, duration math including variable holds, complete companion/action/direction coverage, and distinct walking/running poses. Legitimate source cycles, held poses, and action aliases remain allowed. These checks do not establish subjective visual quality.

The source packager also requires each companion's sheets, timing and credits, the pinned source receipt, license records, the offline builder, native/browser/web source, setup guides, and Actions workflows. Generated runtime copies, builds, dependencies, credentials, caches, and Git metadata stay out of the source ZIP.

Review every companion on the website and desktop at different sizes and against light/dark backgrounds. Check all available animations, source timing, direction changes, transparency, carry/drag, sleep, and return to idle. Record actual clip/frame counts and final visual/runtime checks in [release status](release-status.md).

## Playback and resource use

The players use bounded atlas caches, the manifest's timing, and visibility/pause handling. Browser views respect reduced motion. Local sprite playback avoids a per-instance 3D renderer, but exact CPU, memory, and loading claims still require measurement on the target environment.
