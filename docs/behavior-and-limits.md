# Behavior, limits, and performance

## Windows native companion

The native WPF companion has a transparent cat window over desktop applications, its own tray controls, and its own local reminder state. It can continue local reminders with every browser closed while the Mochi process remains running and Windows is awake. Pause stops animation, hide leaves opted-in native reminders running, and quit stops the native process and delivery timers. These are separate from the extension lifecycle below.

Native Google Calendar/Gmail access and automatic browser/native reminder synchronization are not implemented. Those account integrations remain extension-only and require the browser. Occasional desktop walks use monitor work areas, visible paws/facing, and recall through the tray or available `Ctrl+Alt+M`; Windows exclusive full-screen/security surfaces and mixed-DPI monitor behavior need native acceptance. The optional Tauri scaffold is a separate future port, not the Windows application. See [Windows guide](windows-companion.md) and [release status](release-status.md) for actual build/runtime results.

## Browser extension lifecycle

Running displays the pet and allows opted-in services. Paused stops pet animation and nonessential Google sync but retains explicitly enabled local reminders. Hidden removes the overlay while opted-in reminders and integrations continue. Shutdown sets Mochi's `disabled` feature state and clears its alarms; pending reminder definitions and settings remain saved. Resume rebuilds the schedule. The browser's actual enable/disable/uninstall controls live in its extension manager.

The content overlay mounts only in the top-level permitted page, uses a unique host and isolated shadow DOM, and makes the rest of its viewport pointer-transparent. Pet movement is clamped after resize. Position is remembered per browser window identifier where available. Window IDs are browser-session identifiers rather than durable monitor identities, so a new browser window can start at a safe default.

## Reminder delivery

Reminders are persisted before alarms are created. A moving alarm targets the next pending occurrence within a 24-hour horizon; a 15-minute sweep reconstructs missing/distant alarms. A minimum 30-second floor respects modern Chromium alarm behavior. Delivery uses occurrence IDs derived from reminder identity and scheduled timestamp. Daily/weekly recurrence advances in the selected IANA timezone, preserving wall-clock time across DST where possible; repeated wall-clock times choose the earlier occurrence, and nonexistent times shift forward across the DST gap. The next recurrence returns to the requested wall-clock time.

Expired reminders can notify once, skip, or enter the catch-up list. Quiet hours defer delivery; lifecycle shutdown preserves reminder definitions but performs no delivery. Reminder execution is not a hard real-time guarantee. The browser may delay alarms, the OS may suppress notifications, and a closed browser/asleep device cannot be relied on to execute the worker.

The worker persists occurrence advancement and notification claims before invoking the OS. This deliberately favors at-most-once delivery across restarts over potentially repeated alerts. A crash or notification failure after the claim can miss that occurrence. The delivery ledger is bounded to 3,000 recent entries and expires entries after 90 days; reminders themselves also record delivery advancement. Diagnostics record generic delivery errors without credentials.

## Explicit local reminder links

A newly typed local reminder may opt into opening one safe literal HTTP/HTTPS link through `openUrlOnDue`. At delivery the installed extension opens a tab and the native app launches the default browser, in addition to retaining the notification/dialogue. Link execution is occurrence-bound; snoozing keeps the URL available without repeating automatic opening. Imported data does not retain automatic-open consent, and Calendar-derived links never imply that consent. Multiple or unsafe destinations need clarification rather than a guessed launch.

Website timers cannot guarantee a future popup: the demo attempts a safe new tab, records a blocked outcome when refused, and leaves an explicit **Open saved link** action in its persistent dialogue. Web reminders are memory-only and require the tab to remain open. Navigation is not proof that a page loaded or that its media played.

## Music providers

Song searches open YouTube so you can choose a recording. The installed browser pet has a separate, on-demand media bridge for standard audio/video elements in supported tabs: play/pause, seeking, volume and looping, plus next/previous when supported YouTube/Spotify controls are available. The bridge runs in eligible frames without adding another pet, reports actual player state, and reports refusal instead of claiming success. Protected players, autoplay restrictions and site changes can limit control. The Windows app uses actual Windows media sessions, with a player chooser and enabled Play/Pause/Next/Previous/Stop controls. It does not inject media keys or require the extension. The bundled local demo player is separate from your external media.

## Google services

Calendar refresh uses a seven-day event snapshot with pagination and expands recurring instances through the official API. All-day agenda entries do not generate timed alerts. Selected calendars and event types bound the work. Each sync replaces the previous Calendar-derived reminder snapshot, so moved/cancelled events update at the next successful refresh.

Gmail uses metadata scope, an initial non-notifying baseline, incremental history, and a 404 cursor-expiration fallback. It does not access message bodies, send mail, or mutate read state. Sender filters are exact email addresses. Five-minute scheduled checks back off with jitter after errors; browser execution conditions can extend the cadence. Calendar snapshots are limited to five pages per selected calendar and 1,000 generated events. Gmail metadata work is limited to 50 messages or 20 seconds per batch; its pending backlog is saved and resumed on later checks. Large accounts may need a smaller calendar selection or several checks to catch up.

Google identity is configured and supported for Chrome only in this build. A user-provided public extension OAuth client ID is required. An Edge identity flow, live account compatibility, and public OAuth verification are outside the credential-free build's verification.

## Performance budgets

These are design budgets, not benchmark claims:

- No full-page MutationObserver, page scraping, polling-every-few-seconds, or per-frame DOM query loop.
- CSS transforms/opacity for pet animation; reduced-motion media query; motion paused in hidden tabs.
- Throttled cursor updates and bounded random idle scheduling, cleaned up on unmount.
- No permanent background interval; Chrome alarms own reminder and integration scheduling.
- Shared validation bounds imports, reminder counts, diagnostics/history, and positions.
- Credited source sprite sheets/XML and local transparent 2D animation atlases; no remote executable code or mandatory remote artwork/font downloads.
- Keep the executable browser logic small; the shared sprite library is a deliberate download-size tradeoff for offline playback and a lightweight runtime.
- Use bounded atlas caches, manifest frame rates, visibility/reduced-motion handling, and actual elapsed timing without a 3D renderer in each tab.
- Check individual asset dimensions/file sizes, alpha, real frame variety, clip durations, and complete direction/skin coverage before packaging. Final asset counts and measured bundle sizes belong in the release record.

Runtime/package measurements must refer to the completed sprite-family build. Source artwork is included in the one project ZIP; generated runtime copies are excluded from that source archive.

Measure real CPU/memory with Chrome Task Manager and a normal multi-tab workload. No exact CPU or memory claim is made without those measurements. Check worker inactivity after idle, lack of repeated network requests without configured accounts, and listener cleanup on repeated navigation/reload.

## Security boundaries

Extension messages are typed and validated, and privileged operations are restricted to expected extension contexts. No externally-connectable channel, DOM custom event command bridge, `eval`, dynamic function compilation, or unsafe HTML injection is used. Navigation accepts safe HTTP/HTTPS destinations and rejects credentials/unsafe schemes. Provider notification links use trusted domains. Untrusted page or account content is display data, never an instruction stream.

The isolated pet UI is browser-contained; it is not isolated from the browser/OS or software with equivalent profile privileges. Local storage is not encrypted. Export files may contain personal text. Consult [privacy](privacy.md) and the root security policy before redistributing.

Reference: [Chrome alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms).
