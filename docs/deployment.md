# Runnable downloads, GitHub releases, and Pages

## Complete and source-only distributions

mochi-complete-1.2.0.zip contains root project source, Run-Windows/Mochi.exe, and the unpacked Browser-Extension. Ready-made folders are ignored by Git, so push the extracted root as-is. The canonical mochi-project.zip is source-only and excludes dependencies, credentials, personal runtime data, caches, Git metadata, and generated app/download copies.

## First push publishes runnable releases

Publish the source root and enable Actions. Default-branch pushes, version tags, and explicit runs build Windows first and transfer its exact ZIP to the Linux packaging job. Source/browser/site checks and checksums run before publication. Visitors use Releases → Latest → mochi-windows-companion.zip, or the website Windows button. They extract and run; compilation is unnecessary.

The publication job resolves lightweight/annotated tags to commits. It reuses vVERSION only for identical source. Different source under the same package version gets vVERSION-build.RUN_NUMBER; another-source tag collision fails. The release is marked latest. Only publication has contents write permission. No token is embedded in source or the website.

## Real website downloads without a manual release tag

Pages has a Windows dependency too. The actual portable ZIP is downloaded into dist before package/verify. Packaging copies Windows/browser/source archives into website downloads and emits downloads/manifest.json with version, exact filenames, bytes, and SHA-256.

The site prefers that manifest. Actions supplies the public repository automatically; standalone builds may set MOCHI_REPOSITORY=OWNER/REPOSITORY. If local metadata is absent, the site checks public latest-Release metadata and only offers the direct releases/latest/download/mochi-windows-companion.zip route when the uploaded native asset exists. Missing/unconfigured downloads have an explicit unavailable state. Source ZIPs are never labeled as Windows apps.

## One-time Pages owner activation

A repository owner must choose Settings → Pages → Source → GitHub Actions once. GitHub’s built-in workflow token cannot create a new Pages site, and this project requires no personal token. [Official action inputs](https://github.com/actions/configure-pages/blob/main/action.yml), [Pages creation permissions](https://docs.github.com/en/rest/pages/pages#create-a-apiname-pages-site).

The workflow reads existing Pages metadata and uses its actual base path, including account-root/custom-domain cases. Missing setup produces a clear Settings link, keeps built artifacts available, and skips deployment. Automatic Release publishing remains independent. Domain/DNS setup is an owner action.

## Local hosting and privacy

On Windows run scripts/build-windows.ps1 for the real native ZIP, then the documented build/package/verify commands. Host the complete generated apps/web/dist folder, including downloads and manifest. The lean mochi-website.zip omits nested ZIPs and requires its download folder separately.

Public defaults have no Google API client/shared Cloud project, app backend, analytics, or account data. Google web shortcuts open reviewed Google pages. Optional API monitoring requires each user’s own Cloud client and explicitly personal build; public packaging rejects those artifacts. GitHub hosting/downloads retain GitHub’s normal service/bandwidth limits.

Source workflows retain their full validation path. Remote Actions/Pages success is not claimed by preparing these files locally. Chrome/Edge builds are unpacked packages, not store approval; signing/operator/store review remain separate. The optional Tauri port is unbuilt.
