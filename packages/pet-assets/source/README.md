# Source artwork

This folder preserves the pinned SpriteCollab inputs and their original credit histories. SOURCE.json records immutable source URLs, sizes and SHA-256 hashes. LICENSE-SpriteCollab.md contains the repository's non-commercial attribution terms. Runtime CREDITS.md identifies the artists and original rights holders.

Install Python 3.11+ and Pillow, then run from the project root:

```sh
python packages/pet-assets/tools/fetch_sprites.py --verify
python packages/pet-assets/tools/build_sprites.py
npm run validate:assets
```

Normal application and GitHub Actions builds use the included finished atlases and need neither Python nor a network artwork download. The offline builder preserves drawings and colors, aligns each frame to its original shadow anchor, uses nearest-neighbor integer enlargement, and writes exact frame holds.

An optional refresh uses the pinned importer. If raw file downloads are unavailable, create a local sparse Git checkout at the pinned revision and pass its directory using `fetch_sprites.py --checkout PATH`.
