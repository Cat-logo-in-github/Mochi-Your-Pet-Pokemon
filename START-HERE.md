# Start here - Mochi 1.3

The complete handoff is **`mochi-complete-1.3.0.zip`**. It contains the actual Windows app, the unpacked browser extension, and GitHub-ready source together.

## Run now — no build needed

1. Extract the entire ZIP into a permanent folder.
2. Open **`Run-Windows/Mochi.exe`**. Keep its configuration and assets folder together.
3. Click/right-click the companion for reminders, music, and settings. Its taskbar/tray entry and available Ctrl+Alt+M shortcut bring it back.

For Chrome/Edge, enable Developer mode in the extension manager, choose **Load unpacked**, and select the included **`Browser-Extension`** folder containing manifest.json.

Windows 10/11 with .NET Framework 4.8 is the target. The portable app is unsigned. Native reminders need Mochi running and Windows awake; browser reminders need the browser. This website can be closed.

The separate **source-only `mochi-project.zip`** excludes ready-made folders. Use the website’s Download for Windows or the latest GitHub Release for the runnable portable ZIP.

## Try the useful controls first

- **Windows:** click Mochi → **Music · active players**. Start a song once in your usual player, refresh, select it, and use the controls. The app reads actual Windows media-session responses.
- **Reminders:** open Reminders → **Test notification**. Due reminders request an OS notification and show a persistent readable pixel dialogue beside the creature. Dismiss or Snooze 5 minutes; unread alerts survive restarts. Check OS notification settings if the separate notification is blocked.
- **Browser:** **Settings** on the pet opens the full options page. In Music, **Find player** discovers a supported playing/paused media tab. The main controls show real returned state; the separate original demo tracks are collapsed until opened. Try “remind me about this page in 30 minutes” to save the current page link with an alert.
- **Google:** reviewed web shortcuts work immediately. For automatic monitoring, connect Calendar/Gmail with your own Google project: a Desktop app client in the Windows companion, or a Chrome Extension client in a personal extension copy. Follow [Google setup](docs/google-setup.md), then refresh and send a test notification. These are independent connections; the Windows connection can run with Chrome closed.
- **Appearance:** choose how often the pet follows your cursor. Off/Rarely/Sometimes/Often are available; Sometimes preserves the prior cadence.

## Try a reminder with a link

Type `remind me in 10 min to check mail` for a normal reminder, or `remind me in 20 min to check https://example.com` to request opening a saved link when it is due. Keep Mochi running and the computer awake. The reminder also appears beside the returned companion and requests an OS notification. **Snooze 5 min** keeps the link but does not open it again automatically; **Open link** remains available.

In the website preview, timed new tabs may be blocked. The visible reminder explains this and keeps a manual link. The website must stay open; it does not run desktop or Google jobs after closing.

## Push the extracted root to GitHub

Source is at the root: package.json, README.md, apps, packages, and .github. Publish that root with GitHub Desktop or the Git commands in README. Run-Windows and Browser-Extension are ignored by Git; you can leave them in place. No personal runtime data or credentials belong in the project.

Enable Actions if GitHub asks. Default-branch pushes build/check Windows and browser packages and publish runnable downloads to **Releases → Latest**. The website learns the repository from Actions automatically. Normal users download, extract, and run; they do not compile.

A version tag can be reused only for the same source commit. A later commit with the same package version receives a distinct vVERSION-build.RUN_NUMBER release instead of replacing another commit’s binaries.

## Publish the website once

A repository owner must choose **Settings → Pages → Source → GitHub Actions** once for a new Pages site. GitHub’s built-in workflow token cannot perform first activation. Then run Deploy demo to GitHub Pages or push a default-branch change.

Pages builds Windows first and includes its actual portable ZIP in the website downloads. Missing Pages setup keeps artifacts available, skips deployment, and explains the owner step. The automatic Release flow is separate.

## Google without a shared publisher API quota

The public download has no configured Google client, backend, or shared Cloud project. You can use local reminders, music and reviewed Google web shortcuts immediately. You finish Send/Save on Google's pages.

For optional automatic monitoring, use **your own Google project**. In Windows, open Google connections and save your own **Desktop app** client ID. In Chrome, use the included setup-personal-google.ps1 helper with your **Chrome Extension** client ID to prepare a private personal copy without compiling. The client types are different; follow [the setup guide](docs/google-setup.md). Your quota belongs to your project. Do not share credentials in chat or put them in this source folder.

Gmail defaults to **All new inbox mail**. Important and Senders only are deliberate filters; check which is selected. The first successful check creates a quiet baseline. New eligible alerts then request an OS notification and stay as readable cards until dismissed or snoozed. Check connection status and use **Test notification**; Windows Do not disturb and permissions can hide the OS alert.

Calendar keeps the next **30 days**, refreshed as a rolling window. All-day reminders default to **9 AM** and can be changed or disabled. Cached native Calendar reminders can run with browsers closed while Mochi and Windows remain running and awake. Chrome monitoring needs Chrome. Native checks can run every 1, 5 or 15 minutes; Chrome normally checks every minute. Quiet hours, pause and service mute can defer work/delivery.

Event titles/descriptions and mail subjects/bodies are not fetched. Google Tasks is separate and is not connected. Actual live-account acceptance is listed in [release status](docs/release-status.md). Google and public GitHub downloads retain their own service limits.

## Build locally instead

For the browser extension and website, install Node.js 24+ and npm, then run in the project folder:

```sh
npm ci
npm run validate:assets
npm run check
```

If a restricted Windows environment refuses workspace links, use `npm ci --workspaces=false`. Ordinary builds use the included sprite sheets. Python and Pillow are only needed to rebuild artwork, not to build the apps.

For the Windows application, use Windows with .NET Framework 4.8 and PowerShell:

```powershell
powershell -NoProfile -File scripts/build-windows.ps1
```

This compiles the native application, runs its native checks, and packages it. See [Windows instructions](docs/windows-companion.md) if the compiler is unavailable. Browser builds remain independent of Windows tools.

## Customize it

Choose Eevee, Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon, or Sylveon in Appearance. The same transparent 2D sprite library is used by the website, browser pet, and native companion. Source PNG sheets, XML timing, artist credits, and asset build tools live in `packages/pet-assets`. This is a noncommercial fan project. The MIT code license does not apply to Pokémon characters or SpriteCollab artwork; preserve the supplied credits and Attribution-NonCommercial source terms.

Appearance and movement are adjustable in the application. Advanced art editing is explained in [art production](docs/art-production.md). Optional Google setup is in [Google configuration](docs/google-setup.md). Actual verification results and remaining platform/account checks are in [release status](docs/release-status.md).
