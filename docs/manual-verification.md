# Manual acceptance checklist

Record browser/version, operating system, build version, extension ID, date, and the actual result for each item. An unchecked item is not a passing result. Use mock API tests for CI; only connect your own authorized test account for live integration acceptance.

## Browser extension

- [ ] Extract the release ZIP; confirm `manifest.json` is at its root; Load unpacked in Chrome without manifest errors.
- [ ] Repeat local-function checks in desktop Edge; Google connection must show the explicit unsupported-platform state.
- [ ] Refresh a regular HTTP/HTTPS page; exactly one pet appears. Reload/navigate repeatedly with no duplicate overlay or leaked controls.
- [ ] Pet/feed/play each produces visible feedback. Dragging stays within viewport, survives reload where window identity is retained, and recovers on resize/zoom.
- [ ] All skins, size, opacity, bubble, wandering/following, and compact preferences visibly change behavior and persist.
- [ ] Cursor following is intermittent and throttled; it can be disabled. The pet does not steal focus or block unrelated page controls/typing.
- [ ] Switch tabs and hide the page; animation pauses. Enable OS/browser reduced motion; unnecessary animation stops.
- [ ] Tab through popup/settings/overlay controls. Labels are understandable; focus is visible; Escape closes the interaction menu without a focus trap.
- [ ] Pause/resume, hide/show, and shutdown/resume match the lifecycle table. Shortcut behavior matches browser-assigned keys.
- [ ] Browser internal/store pages fail gracefully; no attempt is made to bypass restrictions.
- [ ] Disable the extension using the browser manager and confirm the overlay is gone after page refresh.

## Commands and local reminders

- [ ] `open GitHub` opens one visible destination; `play Mercy by Shawn Mendes` opens an encoded YouTube search.
- [ ] Unsafe schemes, credential URLs, unknown destinations, and missing parameters produce a clear error/follow-up without navigation.
- [ ] Web-page text and fake DOM custom events cannot send privileged worker commands.
- [ ] Create one-time, daily, and weekly reminders in chosen timezones; edit/pause/delete them; verify local persistence after worker suspension/reload.
- [ ] A due reminder produces an OS notification when permissions allow. Clicking Snooze schedules a later occurrence; Dismiss stops that occurrence.
- [ ] Deliver the same alarm twice and restart the worker; a persisted occurrence never produces a duplicate alert.
- [ ] Restart the browser after a missed reminder and test each notify/skip/catch-up policy.
- [ ] Quiet hours defer alerts; disabled lifecycle stops them; resume reconstructs alarms.
- [ ] Export/import a backup and compare settings/reminders; invalid or oversized JSON and unsafe URLs are rejected. Google tokens are absent.

## Music

- [ ] Start an actual browser recording, find its player in Mochi, and verify play/pause, seek/volume/loop and supported next/previous controls. Confirm protected/unsupported players report refusal.
- [ ] Verify a saved-page reminder reopens its original URL.
- [ ] Verify OS notification plus readable dialogue, snooze/dismiss and pending recovery after restart.
- [ ] Original local demo tracks play only after a user gesture. Local play/pause/seek/volume/loop/next/previous affect the local demo player only.
- [ ] Command history is bounded and does not imply verified listening history.

## Google test account (configuration required)

- [ ] Unconfigured build shows setup guidance and all local features remain usable.
- [ ] Chrome client ID and extension ID match; separate Calendar/Gmail Connect actions request only their documented host origin and scope.
- [ ] Cancel consent, deny host access, expire/revoke authorization, and go offline; errors are useful and secrets/response bodies are absent from logs.
- [ ] Calendar selected calendars/types and offsets affect reminders; timed, all-day, recurring, moved, cancelled, DST, and paginated events behave correctly.
- [ ] Calendar manual refresh/last-sync work; snooze/dismiss affect only local reminders.
- [ ] Gmail initial baseline is silent; a new inbox message notifies once; sender filter, mute, and quiet hours work.
- [ ] An expired Gmail history cursor rebuilds baseline without replaying old notifications. Pagination/batch budgets resume safely.
- [ ] No email bodies are retrieved; no send/modify/delete/read-state operation occurs.
- [ ] Disconnect each service clears its local cache and claims without touching unrelated user data; Google account-side revoke is explained.
- [ ] Quota failures back off across worker restarts instead of retrying every few seconds.

## Website and packaging

- [ ] Website renders at wide desktop and narrow mobile widths with no horizontal overflow or clipped controls.
- [ ] Demo pet/feed/rest/skin controls work. Safe command preview links require a click. Demo reminders are clearly tab-only.
- [ ] Download links return real current ZIPs after packaging; source ZIP excludes builds/dependencies/secrets.
- [ ] Installation, FAQ, troubleshooting, privacy, and browser-versus-desktop explanations match the code.
- [ ] Build with `/REPOSITORY_NAME/`; asset/download links work under that base. Custom-domain/root base works separately.
- [ ] `npm run verify:release` passes after extracting/checking the generated files.

## Native Windows desktop

- [ ] Extract the native ZIP; keep `Mochi.exe.config` beside `Mochi.exe`; launch the actual executable on supported Windows.
- [ ] Observe a transparent unboxed cat over ordinary desktop applications, roaming with paw/facing changes and recoverable dragging/recall.
- [ ] Test pet/feed/play/groom/rest, appearance, hide/show, tray recovery, `Ctrl+Alt+M` conflict handling, and quit.
- [ ] With browsers closed and Mochi running, create a native reminder and verify Windows notification behavior, snooze, pause/delete, quiet hours, lock/suspend/resume, and deduplication.
- [ ] Verify native data persists in the displayed folder and remains independent of browser/Google state.
- [ ] Start-at-sign-in remains unchanged unless explicitly enabled and saved; disabling it removes only Mochi's own current-user entry.
- [ ] Test mixed-DPI/multi-monitor positions, exclusive full-screen/security surfaces, and unsigned-build distribution behavior on the actual target environment.

## Optional Tauri cross-platform port

- [ ] Install documented Rust/Tauri/platform prerequisites before attempting a native build.
- [ ] Build on each claimed platform; validate transparent topmost/drag behavior, focus and click-through, tray/shutdown, display changes, and permission limits.
- [ ] Package an installer only for a platform actually built and tested. The source scaffold alone is not acceptance.

## Performance observations

- [ ] Use browser Task Manager to observe idle/interaction behavior; record measurements instead of asserting an unmeasured CPU/memory number.
- [ ] With Google disconnected, no repeated application network calls occur. With a hidden tab, pet animation is paused.
- [ ] Confirm no unbounded listener or timer growth across repeated menu mounts and page reloads.
