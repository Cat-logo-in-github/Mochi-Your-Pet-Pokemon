# Setup and troubleshooting

## Roaming cat on Windows

For the companion over desktop applications, extract `mochi-windows-companion.zip` and run `Mochi.exe`. Click/right-click the companion for its menu, drag it, or recall it from the tray icon and available `Ctrl+Alt+M` shortcut. Native local reminders can work with browsers closed while this application remains running and the computer is awake. Hide preserves its reminders; Quit stops the process. Native reminders and Google integrations are not synchronized with the browser extension. See the [Windows guide](windows-companion.md) for data, startup, build, and runtime boundaries.

The website's interactive companion is a tab-only demo; neither it nor a settings panel needs to remain open for a native roaming companion. The browser extension below is a separate way to display Mochi on permitted websites.

## Install Chrome or Edge

Use desktop Chrome 120+ or a corresponding modern Edge release. Mobile browsers and Firefox/Safari are not targets for this Manifest V3 package.

1. Extract the extension ZIP into a permanent folder.
2. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
3. Choose Load unpacked and select the folder containing `manifest.json`.
4. Pin Mochi from the browser's extensions menu.
5. Refresh existing HTTP/HTTPS tabs. Restricted browser/store pages cannot display the pet.

The extension remains local and does not require running the website or a local server.

## Build from source

Install Node.js 24+ and npm 11+, open a terminal in the repository, and run:

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run package
npm run verify:release
```

If Windows denies workspace symlinks, use `npm ci --workspaces=false`. Source aliases support that installation. For a normal package manager environment, `npm ci` is preferred. Select `apps/extension/dist` in Load unpacked. Rebuild and reload the extension after source changes; then refresh the target web tab.

## Mochi is missing

- On a new install, refresh the page. Existing tabs do not receive a newly installed content script until navigation/reload.
- Use a normal HTTP/HTTPS website. `chrome://`, `edge://`, extension store, browser PDF viewer, and other protected surfaces may refuse content scripts.
- Open the popup and select Resume/Show if the pet is hidden, paused, or shut down.
- Check site access under the extension's browser settings. Restricted site access may prevent the overlay.
- Open diagnostics in Mochi settings and check the browser extensions page for worker errors.
- Rebuild/reload if you selected source files rather than the built extension folder.

## A reminder did not appear

Browser alarms are delayed rather than guaranteed exact timers. The browser must be running and the device awake. The minimum scheduling floor is 30 seconds. Enable local reminders in settings, check quiet hours and the expired-reminder policy, and allow browser/OS notifications. A paused recurring reminder does not fire. Shutdown stops all Mochi jobs until resume. Browser startup reconstructs the alarm schedule, and a 15-minute sweep recovers missing or delayed jobs.

Delivery is claimed durably before OS notification creation to prevent duplicates on restart. If the browser crashes in that small window, or the OS refuses the notification, an alert may be missed. Check diagnostics and the reminder list. Mochi is a convenience reminder, with no claim of hard real-time delivery.

## Google Connect is unavailable

This release intentionally leaves Google unconfigured until a developer supplies the public OAuth client ID. Follow [Google setup](google-setup.md). The client must be a Chrome Extension OAuth client for the exact stable extension ID. APIs must be enabled, consent configured, test users allowed, and the browser signed into the intended account. Consent cancellation and revoked credentials show actionable errors. The identity flow is Chrome-only; Edge uses local functionality with connection unavailable.

## Music is not pausing

Song searches open YouTube so you can choose a recording. The installed browser pet has a separate, on-demand media bridge for standard audio/video elements in supported tabs: play/pause, seeking, volume and looping, plus next/previous when supported YouTube/Spotify controls are available. The bridge runs in eligible frames without adding another pet, reports actual player state, and reports refusal instead of claiming success. Protected players, autoplay restrictions and site changes can limit control. The Windows app uses actual Windows media sessions, with a player chooser and enabled Play/Pause/Next/Previous/Stop controls. It does not inject media keys or require the extension. The bundled local demo player is separate from your external media.

## Website downloads are missing

Run `npm run build` followed by `npm run package`. Packaging places current ZIP files in both the release folder and website download folder. Running only the Vite build before the first packaging operation leaves no generated ZIP to download. On Pages, use the included deployment workflow and confirm its packaging step succeeds.

## GitHub Pages is blank

Set the Vite base to `/REPOSITORY_NAME/` for a project site and `/` for a root account/custom-domain site. The supplied workflow uses the repository name automatically. Publish `apps/web/dist` only, choose GitHub Actions in repository Pages settings, and inspect the workflow logs for a failed dependency/build step.

## Backups and cleanup

Export from settings before resetting local data. Import a Mochi JSON backup through the dedicated file control; invalid schemas, unsupported URLs, and out-of-range fields are rejected or normalized by the shared validation layer. Google tokens are never exported. Keep backups private because reminder text and recent navigation commands may be personal. Disconnect Google services, reset Mochi data, then remove the extension if desired. Revoke Google account consent separately at Google's account permissions page.

## Disable or remove

Use the browser's extension manager. The pet's Shutdown button stops Mochi services and preserves preferences, reminders, and connection definitions; it cannot uninstall or forcibly disable itself. Remove the extracted build folder only after removing the unpacked extension. Deleting an app directory alone does not delete downloaded backup files or revoke Google account consent.
