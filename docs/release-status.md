# Mochi 1.3 verification

GitHub checkout correction: reproduced the reported LICENSE-SpriteCollab.md mismatch by staging the real upstream CRLF file with Windows autocrlf, then checking it out with Linux settings. Required .gitattributes now disables text conversion for pinned source and runtime artwork. A regression stages/restages and checks out every source input, verifies every original byte and all 743 receipt hashes, and checks the runtime license. The strict original receipt validator is unchanged. Existing repositories need the one-time restaging instructions in START-HERE.md after restoring files from this ZIP.

Prepared 27 October 2026. The integrated JavaScript suite passes **343 tests across 16 files**; TypeScript, ESLint and formatting pass. Production browser and website builds pass. The strict native executable is **1.3.0.0**, with **148 native checks passed and zero failed**, including the new standalone Google engine and persistent reminder integration.

The extension now defaults to All new inbox mail, offers explicit Important/Senders filters, checks approximately every minute and saves readable mail cards before OS notification attempts and Gmail cursor updates. Deferred cards survive pause/quiet hours/mute and restart. Calendar keeps a rolling 30-day selected-calendar schedule, including configurable all-day reminders enabled at 9 AM. The pet's Settings action opens full extension options. Existing deliberately selected mail filters remain selected; legacy defaults are highlighted for review.

**Live Windows acceptance completed:** the human connected Calendar and Gmail separately using a personal Desktop OAuth client. Both showed Connected with successful refreshes. A newly arriving Gmail message reached the durable reminder queue and pixel dialogue, and Windows reported its OS notification shown. A fresh Calendar event in the monitored primary calendar was saved, reached its due reminder and produced Windows' OS-shown callback. The human confirmed receiving the notification. Occurrence claims were persisted for both services. The first Calendar test was on another calendar; additional calendars must be included by ID in preferences. Google Tasks are separate and are not connected.

The final native build was opened with the same private test profile and retained its connection/schedule/queued alerts without another consent. Full-body Eevee, the styled interaction panel and new music panel were inspected. The native music panel displayed an actual Chrome media session and an accepted Pause response. The subsequent single-click correction sends Windows' live play/pause toggle instead of choosing from stale panel state; explicit text Play/Pause commands remain explicit. Pending pixel dialogues yield while interaction panels or modal controls are open, then return without losing unread alerts.

The browser-player redesign has **29 focused tests** for real request/returned-state handling, unavailable controls, errors/busy state, keyboard ranges, mute restoration and demo pause-on-close. Actual live Chrome 1.3 delivery and every third-party player remain target-user acceptance items; the earlier live Chrome connection below verifies the personal connection but is not a claim of fresh 1.3 browser delivery. Browser automation was interrupted by concurrent human interaction during final acceptance.

**Privacy and packaging:** public Google configuration is blank. The personal test extension, native profile, public test client IDs, encrypted account cache and account data are outside the public source and handoff. Native OAuth uses a temporary loopback callback with PKCE; tokens/configuration are DPAPI CurrentUser protected outside the project. Public archives reject personal OAuth configuration and native encrypted cache files. There is no shared publisher Google project, backend or shared publisher API quota. Each optional connection uses its user's own project.

The 1,374 runtime artwork files match the previously completed full pixel/provenance audit byte for byte. Local packaging reuses that audit only after exact SHA-256 equality and separately snapshots every source entry. Published source workflows retain full pixel/provenance checks. Complete archive and website-download verification is recorded by the release packager/verifier; release hashes are in dist/SHA256SUMS.txt. No remote repository was supplied, so no remote Release or Pages deployment is claimed. New Pages sites require the owner's one-time Settings → Pages → GitHub Actions selection.

---

# Mochi 1.2 verification

Prepared 27 October 2026. The integrated JavaScript suite passes **315 tests across 14 files**; TypeScript passes. The strict native executable is version **1.2.0.0**, with **120 native checks passed and zero failed**, using required production artwork. Production browser and website builds pass. Release-specific checks cover actual runnable download availability, base paths, safe release tags, source-at-root complete ZIP layout, exact archive hashes and blocking personal OAuth configuration from public releases.

The Windows ZIP includes the actual executable and all runtime assets. The complete handoff adds Run-Windows and Browser-Extension beside GitHub-ready root source. The website receives the real native/browser/source archives and a manifest recording their version, byte counts and SHA-256. The three download files and both website manifests match the release archives byte for byte and by SHA-256. Direct HTTP acceptance could not run because this environment blocks local sockets and the in-app browser could not reach the preview. No HTTP-delivery success or fresh 1.2 browser-render screenshot is claimed. Public defaults have no Google client, backend or telemetry. Each optional personal monitoring copy uses its user's own Google project and is excluded from public packaging.

The 1.2 artwork is byte-identical across all 1,374 runtime files to the previously completed full pixel/provenance audit. Local packaging reuses that audit only after exact SHA-256 equality; every newly packaged source file is separately snapshotted and checked. Published source workflows retain full pixel/provenance validation. No new drawings or animation claims are inferred from command and packaging work.

Google API/provider behavior is covered by controlled mocks: bounded pagination/backoff, separate read-only scopes, sender matching and importance modes, baseline/deduplication, generic Calendar/mail displays, and private state redaction from exports and host-page messages. The personal Chrome copy was loaded outside the public project. After human Google consent, both Calendar and Gmail showed Connected with a successful sync time and no connection error. This verifies live OAuth and API refresh for the supplied personal client. No account address, token, mail subject/body or event title was saved to the project. **A newly arriving important-mail notification and a real Calendar event reaching its due reminder have not yet been observed end to end.** Those delivery scenarios remain covered by controlled tests, with target-account acceptance still needed. The actual website/download and Windows media/reminder observations from 1.1 remain recorded below; they are not represented as newly performed 1.2 OAuth tests.

GitHub Actions definitions were checked against official action manifests. No remote repository was supplied, so this local preparation does not claim a published release or deployment. Default-branch pushes create runnable releases. A new GitHub Pages site still requires its owner's one-time Settings → Pages → GitHub Actions selection; the built-in token cannot create it.

---

# Release verification record

Prepared 27 October 2026 for Mochi 1.1.1: abbreviated reminders, scheduled links, media control and persistent readable reminders.

## Verified application and artwork

| Check                             | Result                                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full JavaScript suite             | 268 tests across ten files; includes real-element media control, notification refusal/restart recovery, occurrence acknowledgement, page links, cursor settings and returning to idle after acknowledgement in another window |
| TypeScript, ESLint and formatting | Passed on the integrated sprite revision                                                                                                                                                                                      |
| Browser extension and website     | Production builds passed with the real sprites and Eevee icons                                                                                                                                                                |
| Native Windows application        | Strict production build passed 102 native checks, with required artwork present                                                                                                                                               |
| Source provenance                 | All 743 original inputs match pinned SHA-256, sizes and immutable URLs at revision `989a2b0d7272e382a0fb51bb611f744256adafbc`                                                                                                 |
| Runtime pixel library             | 9 species, 2,220 clips, 1,361 physical atlases, 17,118 clip-frame references; all visible RGBA frames, timing, actual source views and catalog coverage passed validation                                                     |
| Complete animation variety        | 44 source action names across the family; individual species provide 13–36 named actions                                                                                                                                      |
| Resource behavior                 | At most three decoded atlases; hidden/paused/offscreen suspension; original frame holds and single-frame static behavior                                                                                                      |

The runtime frame count includes deliberate source aliases and the faster walk used for running. It is not a claim of 17,118 unique drawings. Original sheets contain 9,752 directional frame cells. Original timings range from 0.08 to 2.24 seconds per clip and loop naturally where appropriate.

## Observed behavior on this Windows desktop

The approved native build displayed a recognizable full-body Eevee over the desktop, with ears, body, legs and tail. Roaming changed its actual position. A drag moved it while keeping the interaction panel closed. The styled panel and nine-character chooser were inspected; the appearance selection persisted. Actual full-body Vaporeon was also observed. Screenshots were retained with the local handoff, outside the public source archive.

The strict native playback test used real source sprites, switched species/actions, paused correctly and maintained a maximum of three live atlas slots. Real source clips fit within a single atlas page; page-boundary indexing has separate unit coverage. No real-frame-rate or universal CPU-percentage claim is inferred from test timings.

The native transport adapter was exercised against an actual Windows media session playing a bundled original melody. Pause returned accepted=true and the session changed to Paused; Play returned accepted=true and it changed back to Playing. The guest shell cannot access desktop media sessions; the acceptance process ran in the signed-in desktop session. This verifies direct session transport, not universal support for every protected player or site.

The new native production build was launched on the desktop with an isolated local data folder. A full-body Eevee and the themed panel's Music · active players control were observed. A scheduled reminder produced both “Scheduled OS notification requested” and “Windows reported OS notification shown” callbacks. OS display is still controlled by Windows; the callback is not a universal visible-toast guarantee. The unread queue was acknowledged during desktop interaction. The running preview's settings are preserved when it is replaced by an unlimited run.

The updated actual website was opened in the in-app browser. Hiding its pet, then scheduling the five-second demo reminder, returned the creature with a readable floating pixel dialogue containing Snooze 5 min and Dismiss. The website's demo player and notification permission remain separate from extension/native capabilities. No live extension installation or real Google-account acceptance is claimed by the automated tests.

## Product behavior in 1.1

- Native playback lists actual Windows sessions on demand and disables unavailable transport controls. No simulated keyboard media keys or continuous media scanner runs.
- The extension uses an isolated media bridge in eligible frames while mounting only one top-level pet. Explicit requests control standard audio/video, with supported site track controls and bounded response checks.
- Reminder occurrence snapshots are saved before schedules advance or OS side effects run. The unread queue remains available until acknowledged, including when OS notifications fail. Browser acknowledgement targets the delivered occurrence and preserves a future repeat.
- Readable dialogues return the pet to view; quiet hours, disabled delivery and shutdown remain respected. A settings/status test helps diagnose notification permission.
- Cursor-follow frequency is persisted with Off/Rarely/Sometimes/Often; the default preserves the previous cadence. Reminder queue refresh is event-driven rather than tied to every roaming position change.
- Explicit page-reminder commands save the current page title/link locally and provide a link in the reminder. No basic new/duplicate/pin tab feature was added.

## Reproducible package checks

`npm run package` creates the unified GitHub-ready project ZIP and runtime build artifacts. `npm run verify:release` checks archive safety, SHA-256 checksums, source/provenance requirements and byte-identical artwork across the project, extension, website and native package. `START-HERE.md` describes local builds and GitHub Actions, including Pages deployment.

The single project ZIP excludes dependencies, caches, private credentials, generated app copies, abandoned 3D models and experimental render tools. Normal builds reuse the included artwork and do not download or render assets.

## Account and platform configuration

Google Calendar/Gmail monitoring requires each user's own Chrome extension client/project, API/consent configuration and live account testing. Public builds contain no OAuth client or shared publisher Google project. Edge local features work separately; its Google identity route is unavailable in this build. No real account credentials or tokens are included.

Native local reminders require Mochi to be running and Windows awake. Browser alarms and optional Google connections require the browser. Quiet hours and OS notification settings apply. Mixed-DPI/multiple displays, sleep/lock/resume, exclusive full-screen surfaces and notification visibility need acceptance on the target PC.

The optional Tauri port remains unbuilt. No macOS/Linux native installer is supplied. GitHub Actions and Pages workflows are included; no remote repository, deployment or public release was created during local preparation.

Pokémon/SpriteCollab artwork retains its original credits and non-commercial terms. The application code's MIT license is separate.

## 1.1.1 scheduled-link acceptance

The exact reported desktop command `remind me in 10 min to check mail` was accepted in the actual native UI. The integrated suite passes 268 tests; the final strict native build passes 102 checks. Production browser/site builds, TypeScript, ESLint and formatting pass.

A scheduled native test opened `https://example.com/?mochi-reminder-test=20261027-final` in the default browser. The actual browser window showed Example Domain. The saved occurrence and action claims match; the unread dialogue reports that the link was sent to the browser. Windows reported the OS notification shown. A real screenshot of the readable pixel dialogue was retained outside the source archive. Snooze retains a manual link with automatic opening disabled, covered by the final native tests.

For this code-only revision, the completed full pixel audit is reused only after SHA-256 equality of every runtime artwork file against the fully audited 1.1.0 archive `AB550CA2128C6AD70BDF23FAD7CA8D74CCBDBFDDA4734C4C35BFB61059D2F6A0`. Fresh source/provenance, archive safety, full source-entry digests, checksums and matching runtime artwork across the new packages are checked. The published CI/package scripts retain their default full pixel validation; the local reuse coordinator is excluded from the source ZIP.
