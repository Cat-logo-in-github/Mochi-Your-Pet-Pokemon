# Contributing

Use Node 24+ and npm 11+. Install from `package-lock.json` with `npm ci`; Windows environments denying workspace symlinks can use `npm ci --workspaces=false`. Keep npm as the canonical lockfile workflow.

```sh
npm run format
npm run validate:assets
npm run typecheck
npm test
npm run lint
npm run build
npm run package
npm run verify:release
```

Keep domain parsing/validation pure in `packages/shared`, browser privileged work in the extension worker, and page UI isolated in its shadow root. Add meaningful regression coverage for behavior changes, especially command/URL validation, reminder recurrence/DST/deduplication, messaging senders, and integration errors. Tests must use fake data and mocked APIs rather than real accounts.

Keep unsupported capabilities visibly unavailable. Do not add analytics, browsing history collection, remote executable code, hidden autoplay, page scraping, or broad permissions without an explicit feature justification and privacy review. Use accessible labels/focus, reduced motion, and cleanup for event listeners/timers. Document actual boundaries and test outcomes.

Never commit `.env`, tokens, client secrets, private signing keys, personal backups, dependencies, or generated builds. Application code and original demo audio use the MIT license. Pokémon characters and SpriteCollab sprite sheets retain separate source terms, including Attribution-NonCommercial 4.0. Preserve per-species credits, the pinned source receipt, and license copies; do not relabel them as MIT artwork.

Before a pull request, explain the concrete before/after behavior and tests run. Public maintainers should configure a real security reporting channel and keep privacy/operator details current.

Sprite changes must retain source PNG sheets, animation XML timing, credits, the pinned receipt, and the offline atlas builder. Preserve original frame holds and eight-direction locomotion, use transparent RGBA atlases, and pass the asset checks. Shared source animations and held poses are legitimate; static walking placeholders are not. Website/browser/native consumers use the same versioned manifest.
