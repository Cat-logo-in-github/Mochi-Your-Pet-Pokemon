# Mochi Windows companion

This is the Windows application from the unified Mochi project. It places an animated 2D sprite companion on a transparent, unboxed desktop window. It has no permanent dashboard; the normal taskbar entry, tray icon, and available Ctrl+Alt+M shortcut provide recovery.

## Run

Extract the native build ZIP and keep `Mochi.exe`, `Mochi.exe.config`, and the entire `assets` directory together. Open the executable on Windows 10/11 with .NET Framework 4.8. No installer, administrator access, account, or browser tab is needed for the local companion. The portable executable is unsigned unless a distributor signs it separately.

Click/right-click the companion to open its themed interaction panel. The accessible character button is named **Mochi - interact or drag**; Enter, Space, or Shift+F10 opens the panel. Escape closes that panel. Drag/carry the companion to move it. The tray provides Show/recall, reminders, settings, pause, hide, and Quit. A conflicting recall shortcut is not taken over.

## Character and animation

The app reads the same offline 2D sprite manifest/atlases as the browser and website, under `assets/mochi/`. Source sprite PNG sheets, XML timing, credits, and build tools are part of `packages/pet-assets` in the project source. Runtime playback uses transparent pixel sprites. The MIT code license does not relicense the characters or third-party sprite artwork.

Idle, walking/running, turning, grooming, stretching, pounce/play/feed, happy, sleep, alert, and carry actions use the manifest's real timing. Direction changes select the corresponding sprite heading. Appearance offers cursor-follow frequency Off/Rarely/Sometimes/Often (Sometimes preserves the previous cadence), and Eevee and its eight evolutions in a labeled tile selector. Nearest-neighbor scaling preserves pixel edges; source frame holds are timed directly, without fading between poses. Tail swish and Surprise me select supported source actions, and the credits viewer displays the bundled artist/license records. The player keeps a bounded atlas cache and stops unnecessary animation when hidden, minimized, paused, locked, or suspended. Exact CPU/memory use requires measurement on the target machine.

## Reminders and commands

Local native reminders can continue with browsers closed while this process is running and Windows is awake. Add one-time, daily, and weekly reminders; snooze five minutes, pause/resume, delete, and set quiet hours. Missed native reminders notify once on the next available run. Hide/pause preserves enabled reminders; Quit stops delivery until the next launch. Windows notification settings can suppress alerts.

Daily/weekly recurrence preserves the stored Windows timezone and intended wall-clock hour. Repeated DST hours choose the earlier occurrence; nonexistent spring times move forward to a valid local time. Occurrence claims and a readable unread queue are saved before asking Windows to notify. A cream pixel-style dialogue appears beside the full creature and stays until Dismiss or Snooze 5m. The pet is recovered into a monitor work area and temporarily raised above other windows without taking keyboard focus. Multiple due reminders share an OS summary and remain individually readable in the queue. OS Do not disturb can suppress the separate system notification; Reminders includes a Test notification button and delivery status.

Commands support validated HTTP/HTTPS shortcuts, visible YouTube search, relative reminders, and pause/resume/next/previous music commands. Music · active players opens a real Windows media-session chooser with capability-aware Play, Pause, Next, Previous and Stop. Start a song once in a compatible browser/music app, then refresh players. The result is the actual Windows accepted/refused response; protected players can decline. Windows 10 version 1809 or later is required. Controls run only on request, with no media polling service. Optional native Google connections use your own Desktop OAuth client and independent consent/cache; there is no automatic browser/native token bridge. The companion can monitor while Chrome is closed, provided Mochi stays running and Windows awake.

## Data and startup

Default ordinary state is `%LOCALAPPDATA%\Mochi\state.json`: preferences, local reminders, shortcuts, position and generic reminder delivery state. Separate Google configuration, optional client secret, tokens and the complete private Google cache are DPAPI-protected for the current Windows user under `%LOCALAPPDATA%\Mochi\Google`. Ordinary state is not an encrypted vault; DPAPI does not protect against software running as the same user. This is independent of extension storage. Quit before backing up/deleting the native data folder. No telemetry, external AI service, or unrelated browsing-history collection is included.

Start at sign-in is an explicit Settings checkbox. Saving that preference changes only the current user's Mochi startup entry; it is not enabled merely by running the application. Disable it before moving/deleting the portable executable. To remove Mochi, disable optional sign-in startup, quit, delete its extracted application folder, and optionally remove native state.

## Build and verify

From the project root on a supported Windows host:

```powershell
powershell -NoProfile -File scripts/build-windows.ps1
```

The default build requires the included production sprite asset library, compiles with the installed .NET Framework compiler, runs native self-tests, and packages the real application plus assets. The browser/site build remains separate and cross-platform.

For isolated testing, `--self-test --data-dir DIRECTORY` writes `self-test-results.json`; regular QA can use `--data-dir DIRECTORY`. A custom data directory disables sign-in startup changes. Any `-AllowMissingPetAssets` development preview is an explicit static fallback and must not be distributed as the completed sprite application. Final native checks and real GUI/notification observations are recorded in the root `docs/release-status.md`.

Mixed-DPI/multi-monitor positions, exclusive full-screen/security surfaces, lock/resume, and OS notification delivery need acceptance on the actual target environment. No macOS/Linux native installer or universal always-on-top guarantee is implied.

## Reminder links in 1.1.1

Use `remind me in 10 min to check mail`, or include one explicit safe URL: `remind me in 20 min to check https://example.com`. The second command also requests opening that destination in the default browser when the local reminder is due. Keep Mochi running and Windows awake. The pet dialogue and OS notification are separate delivery surfaces.

Snooze five minutes preserves the link for manual opening and does not repeat automatic opening. Imported data does not silently grant navigation consent. Calendar synchronization is read-only in either runtime. It does not create events or connect Google Tasks.

## Google web helpers

Try `show unread emails`, `search gmail for invoices`, `emails from person@example.com`, `compose email to person@example.com subject: Hello body: Draft text`, `show tomorrow's agenda`, or `create calendar event Team catch-up tomorrow at 15:00 for 30 minutes`. Mochi shows the planned action before opening a fixed Google page. You finish Send or Save in Google; draft/search/event command text is not written to native state. Browser history and Google can retain the resulting URL after you choose to open it.

## Personal Google monitoring in 1.3

The public app has no configured Google client, shared publisher Cloud project or backend. For automatic monitoring, create your own Google project, enable Calendar/Gmail APIs, configure consent and create a **Desktop app** OAuth client. Open **Google connections**, save its public client ID locally and connect each service separately on Google's consent page. A Chrome Extension client is not interchangeable. If Google requires a Desktop client secret, use only the optional masked local field. Never paste passwords, secrets, tokens or credentials JSON into chat, logs or source. The app uses PKCE/state validation and a temporary local loopback callback; no shared server is needed.

Gmail defaults to **All new inbox mail**; **Important** and **Senders only** are deliberate filters. The initial successful check establishes a silent baseline. Later eligible arrivals are queued durably, request Windows notifications and stay readable until acknowledged. Status shows the selected mode and check/delivery outcome; quiet hours, pause and mute can defer delivery. No mail subjects/bodies or event titles/descriptions are fetched.

Calendar uses a rolling **30-day** snapshot, timed-event offsets and all-day reminders enabled at **9 AM** by default. Choose checks every **1, 5 or 15 minutes**. Cached Calendar events become native reminders and can notify with every browser closed while Mochi runs and Windows is awake. Network refresh is needed for event changes and new mail. Each service disconnects independently; revoke Google-side access separately.

Native Google state stays in the DPAPI-protected local store and is never included in the public project or ZIP. Your project owns the API quotas. Chrome's optional monitoring copy has a separate client and store. Full setup is in the unified project's docs/google-setup.md. Live native OAuth and real due-event/new-mail acceptance are recorded separately in docs/release-status.md; automated checks alone do not claim those outcomes.
