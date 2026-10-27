# Windows roaming companion

The native Windows companion is a separate application from the browser extension. Its transparent window contains the companion artwork; no browser tab, settings dashboard, or demonstration box needs to remain open. The source lives in `apps/windows-companion`. A separate `apps/desktop` Tauri scaffold is retained for a future cross-platform port and is not the Windows runtime described here.

Native compilation, automated self-tests, and manual runtime checks must be recorded separately in [release status](release-status.md). Do not infer native success from the browser's TypeScript/Vitest results.

## Run the Windows release

1. Extract `mochi-windows-companion.zip` into a permanent folder.
2. Double-click `Mochi.exe`, keeping `Mochi.exe.config` beside it.
3. Click or right-click the companion for its interaction menu. Drag it to choose a location. Let it roam for occasional walks, grooming, and playful poses.
4. Use the normal taskbar entry or notification-area/tray icon to recover the companion; the tray provides Show/recall. `Ctrl+Alt+M` is registered only when available; a conflicting shortcut is not taken over.
5. Use **Hide** to remove the companion while keeping its native reminders active, or **Quit Mochi** to stop the application and its delivery timers.

Target runtime: Windows 10/11 with .NET Framework 4.8. A native ZIP is only provided after a real build; it is not a macOS/Linux installer or a browser extension. The application is unsigned unless a distributor signs it separately. No code-signing certificate or trust-bypass claim is part of this source release.

## Behavior and controls

Mochi plays the shared transparent 2D sprite atlases on a borderless transparent WPF window, optionally always on top. Keep its `assets/mochi` runtime directory beside the executable. Occasional movement is clamped to monitor work areas; dragging and recall recover visible placement. Roaming and intermittent cursor following can be changed independently. Pause/rest stops pet animation while opted-in local reminders continue. Appearance settings include nine companions, size, and opacity. Tail swish and Surprise me trigger available source animations. Pixel scaling keeps sharp sprite edges, source frame holds retain their timing, and the credits viewer displays the bundled artwork records.

The companion and menus are interactive. Transparent pixels should let underlying content remain accessible; no global mouse/keyboard hook is used. Always-on-top behavior is subject to Windows security surfaces and exclusive full-screen applications. Mixed-DPI/multi-monitor and OS-specific behavior needs the native manual checklist rather than a cross-platform reliability claim.

The companion has a normal taskbar entry for recovery. Its tray icon provides show/recall, interactions, reminders, settings, hide, and quit; neither requires a permanent dashboard. Start at Windows sign-in is an explicit opt-in setting. No installer, service, scheduled task, or background autostart entry is silently added merely by running Mochi.

## Native reminders

Create a one-time, daily, or weekly reminder for the local Windows timezone. The native application persists definitions and occurrence claims to its own local state. Snooze five minutes, pause/resume, delete, and quiet-hour controls are available. Browser reminders are a separate store; there is no automatic synchronization between the two applications.

Native reminders can work with every browser closed, but **Mochi itself must stay running and Windows must be awake**. Closing the process stops delivery; persisted reminders are reconsidered on the next run. Lock/suspend and notification settings can defer or suppress alerts. Claims are persisted before asking Windows to show a notification, favoring at-most-once delivery; a crash or OS refusal can miss an alert rather than duplicate it.

Optional native Calendar/Gmail connections use your own Google Desktop client and run independently of the extension. Successfully cached Calendar events become native reminders and can notify with browsers closed while Mochi stays running and Windows awake. New mail and event changes require a successful network check. Read [Google setup](google-setup.md); a Chrome Extension client is not interchangeable, and no browser/native token bridge is used.

## Commands and privacy

Native text commands support local reminders and validated HTTP/HTTPS website shortcuts, including visible YouTube search navigation. It does not run shell command text or scrape YouTube. Music controls target actual Windows media sessions; optional Google monitoring reads only the documented metadata/time fields after consent. Native shortcuts can be edited in settings. Any OS URL launch uses the validated destination through the normal browser association.

The default data file is `%LOCALAPPDATA%\Mochi\state.json`; settings show the exact local data directory. It holds desktop preferences, pet position, shortcuts, and reminder state in an ordinary local JSON file. Separate native Google credentials/configuration and the entire private cache are DPAPI-protected for the current user under `%LOCALAPPDATA%\Mochi\Google`. Neither store synchronizes with the extension. DPAPI does not protect against code running as your Windows user or a compromised PC. Quit the application before backing up or deleting that directory. Exported extension backups are a different schema/store. The default experience uses no analytics or remote application server.

To uninstall a portable build, turn off start-at-sign-in if enabled, quit through the tray menu, delete the application folder, and remove the displayed native data folder if desired. This does not delete browser extension data or revoke Google consent.

## Build from source

Run on a supported Windows host with the .NET Framework 4.8 compiler/runtime and WPF assemblies available:

```powershell
powershell -NoProfile -File scripts/build-windows.ps1
```

Expected actual outputs after a successful build are `dist/windows/Mochi.exe` and `dist/mochi-windows-companion.zip`. The Windows build is deliberately separate from `npm run build`, so browser/Linux CI does not need WPF or Windows toolchains. Run `npm run package` afterward to include an existing native ZIP in the shared SHA-256 list; the core packager validates the native archive and never fabricates one when the compiler is unavailable.

The production sprite build requires the actual shared manifest and atlases. A development build that explicitly allows missing artwork is a static fallback, not evidence that the completed sprite asset library was tested. Native self-test counts and visible sprite playback acceptance are recorded separately in the final release-status document. The executable supports isolated `--self-test --data-dir DIRECTORY` checks without changing normal data or sign-in startup.

The root release verifier checks native ZIP structure, root `Mochi.exe` executable signature, safe file paths, and its checksum if the native ZIP is listed. These archive checks do not replace native self-tests or launching the app.

## Playback, dialogue and cursor frequency in 1.1

**Music · active players** controls actual Windows media sessions on Windows 10 version 1809+ or Windows 11. Choose a player, then use enabled Play/Pause/Next/Previous/Stop controls. Refresh is on demand; no continuous player scanning runs. Start a recording once in your browser/music app so it exposes a session. A song search still asks you to choose the recording; no unverified autoplay result is claimed.

Due local reminders persist an unread queue and request a Windows notification. A readable pixel dialogue anchors near the creature, clamps inside the monitor work area, and stays until dismissed or snoozed. The creature is temporarily raised for alerts and recall, restoring the user's Always on top preference afterward. OS Do not disturb can suppress the separate notification; the dialogue and unread queue remain available. Reminders offers a notification test and status.

Cursor following remains optional, with Off/Rarely/Sometimes/Often in Appearance. Sometimes preserves the previous default cadence. No global pointer hook or busy polling is added.

## Short time units and explicit reminder links in 1.1.1

`remind me in 10 min to check mail` schedules a normal local reminder. `remind me in 20 min to check https://example.com` also requests launching the safe saved URL in the default browser when due. Common second/minute/hour/day/week abbreviations are accepted. The application must stay running and Windows awake. OS notification settings can suppress the notification, so the persistent pet dialogue and saved link remain useful.

The automatic opening belongs to the explicitly scheduled delivery. Snoozing preserves the URL as an **Open link** action without opening it automatically again. Imported reminders and optional browser Google Calendar links do not silently authorize native navigation. Calendar monitoring is read-only in both runtimes. Google Tasks is not connected. Reviewed event-editor shortcuts open Google so you can choose Save there; they do not write events through the API.

## Personal Google connections in 1.3

Open **Google connections** in the companion. Create your own Cloud project, enable the required Calendar/Gmail APIs, configure consent/test-user access and create a **Desktop app** OAuth client. Save its public client ID in the native connection window. If Google requires that client's secret, use only the optional masked local field; never paste secrets, passwords, tokens or credentials JSON into chat or the source folder. Connect Calendar and Gmail separately on Google's browser consent page. The app uses PKCE/state checks with a temporary loopback callback and does not need a permanent server.

The public download has no configured client or shared publisher project. Your connections use your own project's quotas. Configuration, optional secret, tokens, generic cached events and pending mail are runtime data outside the project and public ZIP. Full setup, disconnection and provider limits are in [Google setup](google-setup.md).

Gmail starts with a silent baseline. **All new inbox mail** is the default; **Important** and **Senders only** are explicit narrower modes. The connection window exposes the selected filter and check/delivery status. New eligible mail stays in a durable readable queue and requests an OS notification; quiet hours, pause and mute can defer delivery. Mail subjects/bodies and Calendar titles/descriptions are not fetched.

Calendar maintains a rolling **30-day** cache. All-day reminders default to **9 AM**, with controls to change or disable them; timed events use the selected advance offset. Checks can run every **1, 5 or 15 minutes**, with retry backoff. Cached reminders remain useful offline, but changes and new arrivals cannot be discovered without a refresh. Quit stops the native process; it is not a Windows service.

The connection UI and implementation are separate from live-account acceptance. See [release status](release-status.md) for the exact checks actually completed; no unrecorded native sign-in or end-to-end delivery success is implied.
